import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

/**
 * Keeps a rendering failure in one section from blanking the whole app.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-6">
          <div className="glass-panel max-w-md p-8 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/12 text-red-300 ring-1 ring-red-400/20">
              !
            </div>

            <h2 className="mt-5 text-lg font-semibold text-white">
              Something went wrong
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-400">
              A section of the dashboard failed to render. Your uploaded chat
              is still safe, reloading usually fixes this.
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_-8px_rgba(255,255,255,0.5)]"
            >
              Reload ChatScope
            </button>

            <p className="mt-4 text-xs text-gray-600">{this.state.message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
