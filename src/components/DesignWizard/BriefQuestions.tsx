import React from "react";
import type { BriefQuestion, BriefAnswers } from "./useDesignProject";

interface Props {
  questions: BriefQuestion[];
  answers: BriefAnswers;
  onAnswer: (id: string, value: string | string[]) => void;
  dark: boolean;
}

/**
 * BriefQuestions — Stage 1A 명확화 질문 chip UI.
 * single-choice / multi-choice / free-text 3종 렌더.
 * 답변은 부모 Brief.tsx의 briefAnswers state로 전파.
 */
export default function BriefQuestions({ questions, answers, onAnswer, dark }: Props) {
  const subtle = dark ? "text-dsub" : "text-sub";
  const ink = dark ? "text-dink" : "text-ink";
  const accent = "#c96442";
  const chipBaseLight =
    "border-line text-ink hover:border-[#c96442]/50 hover:bg-muted";
  const chipBaseDark =
    "border-dline text-dink hover:border-[#c96442]/50 hover:bg-[#2a2a28]";
  const chipBase = dark ? chipBaseDark : chipBaseLight;

  return (
    <div className="flex flex-col gap-4" data-testid="design-brief-questions">
      {questions.map((q) => {
        const answer = answers[q.id];
        return (
          <div key={q.id} className="flex flex-col gap-1.5">
            <div>
              <div className={`text-[12px] font-medium ${ink}`}>{q.title}</div>
              {q.subtitle && (
                <div className={`text-[10.5px] mt-0.5 ${subtle}`}>{q.subtitle}</div>
              )}
            </div>

            {q.type === "single-choice" && q.options && (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const selected = answer === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onAnswer(q.id, opt.value)}
                      className={`text-left px-3 py-2 rounded-[6px] border text-[11px] transition-colors ${chipBase}`}
                      style={
                        selected
                          ? {
                              boxShadow: `0 0 0 1.5px ${accent}`,
                              borderColor: accent,
                            }
                          : undefined
                      }
                      data-testid={`brief-q-${q.id}-${opt.value}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium ${ink}`}>{opt.label}</span>
                        {selected && <span style={{ color: accent }}>✓</span>}
                      </div>
                      {opt.hint && (
                        <div className={`text-[10px] mt-0.5 ${subtle}`}>{opt.hint}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "multi-choice" && q.options && (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const arr = Array.isArray(answer) ? answer : [];
                  const selected = arr.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? arr.filter((v) => v !== opt.value)
                          : [...arr, opt.value];
                        onAnswer(q.id, next);
                      }}
                      className={`text-left px-3 py-2 rounded-[6px] border text-[11px] transition-colors ${chipBase}`}
                      style={
                        selected
                          ? {
                              boxShadow: `0 0 0 1.5px ${accent}`,
                              borderColor: accent,
                            }
                          : undefined
                      }
                      data-testid={`brief-q-${q.id}-${opt.value}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium ${ink}`}>{opt.label}</span>
                        {selected && <span style={{ color: accent }}>✓</span>}
                      </div>
                      {opt.hint && (
                        <div className={`text-[10px] mt-0.5 ${subtle}`}>{opt.hint}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "free-text" && (
              <textarea
                value={typeof answer === "string" ? answer : ""}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                rows={2}
                placeholder={q.placeholder ?? "비워둬도 OK"}
                className={`w-full text-[11px] p-2 rounded-[6px] border resize-y ${dark ? "bg-dmuted border-dline text-dink" : "bg-surface border-line text-ink"} font-mono leading-[1.5]`}
                data-testid={`brief-q-${q.id}-text`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
