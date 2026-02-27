export async function register() {
  // Only register error handlers in Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Prevent unhandled promise rejections from crashing the server
    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    // Prevent uncaught exceptions from crashing the server
    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
    });
  }
}
