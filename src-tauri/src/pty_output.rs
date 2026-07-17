use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

pub(crate) const PTY_OUTPUT_QUEUE_DEPTH: usize = 64;
pub(crate) const PTY_READ_CHUNK_BYTES: usize = 8 * 1024;

const PTY_OUTPUT_BATCH_MAX_BYTES: usize = 64 * 1024;
const PTY_OUTPUT_BATCH_WINDOW: Duration = Duration::from_millis(8);

/// Coalesces small PTY reads before crossing the Tauri event bridge.
///
/// The bounded sender owns backpressure. When the renderer or event bridge is
/// slower than the child process, the PTY reader eventually blocks on send and
/// lets the operating system throttle the child instead of growing memory.
pub(crate) fn forward_output_batches<F>(receiver: Receiver<Vec<u8>>, mut emit: F)
where
    F: FnMut(Vec<u8>),
{
    let mut pending: Option<Vec<u8>> = None;

    loop {
        let first = match pending.take() {
            Some(chunk) => chunk,
            None => match receiver.recv() {
                Ok(chunk) => chunk,
                Err(_) => break,
            },
        };

        let deadline = Instant::now() + PTY_OUTPUT_BATCH_WINDOW;
        let mut batch = first;
        let mut disconnected = false;

        while batch.len() < PTY_OUTPUT_BATCH_MAX_BYTES {
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                break;
            };

            match receiver.recv_timeout(remaining) {
                Ok(chunk) => {
                    if batch.len() + chunk.len() > PTY_OUTPUT_BATCH_MAX_BYTES {
                        pending = Some(chunk);
                        break;
                    }
                    batch.extend_from_slice(&chunk);
                }
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    disconnected = true;
                    break;
                }
            }
        }

        emit(batch);

        if disconnected && pending.is_none() {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        forward_output_batches, PTY_OUTPUT_BATCH_MAX_BYTES, PTY_OUTPUT_QUEUE_DEPTH,
        PTY_READ_CHUNK_BYTES,
    };
    use std::sync::mpsc::sync_channel;
    use std::thread;

    #[test]
    fn coalesces_available_chunks_before_emitting() {
        let (sender, receiver) = sync_channel(4);
        sender.send(vec![1, 2]).unwrap();
        sender.send(vec![3, 4]).unwrap();
        drop(sender);

        let mut emitted = Vec::new();
        forward_output_batches(receiver, |batch| emitted.push(batch));

        assert_eq!(emitted, vec![vec![1, 2, 3, 4]]);
    }

    #[test]
    fn carries_over_chunks_that_would_exceed_the_batch_limit() {
        let (sender, receiver) = sync_channel(4);
        sender.send(vec![1; PTY_OUTPUT_BATCH_MAX_BYTES]).unwrap();
        sender.send(vec![2; 8]).unwrap();
        drop(sender);

        let mut emitted = Vec::new();
        forward_output_batches(receiver, |batch| emitted.push(batch));

        assert_eq!(emitted.len(), 2);
        assert_eq!(emitted[0].len(), PTY_OUTPUT_BATCH_MAX_BYTES);
        assert_eq!(emitted[1], vec![2; 8]);
    }

    #[test]
    fn preserves_order_and_bytes_during_sustained_output() {
        let (sender, receiver) = sync_channel(PTY_OUTPUT_QUEUE_DEPTH);
        let expected: Vec<Vec<u8>> = (0..256)
            .map(|index| {
                let mut chunk = vec![(index % 251) as u8; PTY_READ_CHUNK_BYTES];
                chunk[..8].copy_from_slice(&(index as u64).to_le_bytes());
                chunk
            })
            .collect();
        let expected_bytes = expected.concat();

        let producer = thread::spawn(move || {
            for chunk in expected {
                sender.send(chunk).unwrap();
            }
        });

        let mut emitted_bytes = Vec::new();
        forward_output_batches(receiver, |batch| emitted_bytes.extend_from_slice(&batch));
        producer.join().unwrap();

        assert_eq!(emitted_bytes, expected_bytes);
    }
}
