import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", background: "#f8d7da", color: "#721c24", height: "100vh" }}>
          <h1>Xatolik yuz berdi! (Error)</h1>
          <p>Iltimos, ushbu xatolikni skrinshot qilib yuboring:</p>
          <pre style={{ background: "#fff", padding: "10px", overflow: "auto" }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ background: "#fff", padding: "10px", overflow: "auto", fontSize: "12px" }}>
            {this.state.errorInfo?.componentStack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
