import React from "react";
import ReactDOM from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./index.css";
import App from "./components/App";

type BootErrorBoundaryState = {
  error: Error | null;
};

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack || ""}`;
  return String(error);
}

function BootErrorFallback({ error }: { error: unknown }) {
  return (
    <div className="min-h-full bg-[#1f1f1d] p-8 text-[#faf9f5]">
      <div className="mx-auto max-w-[860px] rounded-[10px] border border-[#da7756]/45 bg-[#262522] p-5 shadow-xl">
        <div className="text-[18px] font-semibold">Atelier 화면을 시작하지 못했습니다.</div>
        <p className="mt-2 text-[13px] leading-6 text-[#c9c5bb]">
          검은 화면 대신 원인 메시지를 표시합니다. 아래 내용을 기준으로 설치본을 복구할 수 있습니다.
        </p>
        <pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-[8px] bg-black/35 p-4 font-mono text-[12px] leading-5 text-[#f4e8dc]">
          {errorText(error)}
        </pre>
      </div>
    </div>
  );
}

class BootErrorBoundary extends React.Component<React.PropsWithChildren, BootErrorBoundaryState> {
  state: BootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Atelier boot render error", error, info);
  }

  render() {
    if (this.state.error) return <BootErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}

function renderBootError(error: unknown) {
  const root = document.getElementById("root");
  if (!root) return;
  ReactDOM.createRoot(root).render(<BootErrorFallback error={error} />);
}

window.addEventListener("error", (event) => {
  renderBootError(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  renderBootError(event.reason || "Unhandled promise rejection");
});

try {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <BootErrorBoundary>
        <App />
      </BootErrorBoundary>
    </React.StrictMode>,
  );
} catch (error) {
  renderBootError(error);
}
