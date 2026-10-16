export async function register() {
  // Pętla deweloperska powiadomień; zależności węzłowe ładujemy tylko w środowisku Node
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
