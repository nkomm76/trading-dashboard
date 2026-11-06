// Verdeckte Eingabe im Terminal (für set-password und docker-paket)

/** Liest eine Eingabe, ohne sie anzuzeigen (je Zeichen ein "*"). */
export function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      console.error("Bitte in einem Terminal ausführen, damit die Eingabe verdeckt bleibt.");
      process.exit(1);
    }
    // Erst Echo abschalten, dann fragen – sonst könnte sehr schnelle Eingabe sichtbar werden
    stdin.setRawMode(true);
    stdout.write(question);
    stdin.resume();
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(input);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl-C
          stdin.setRawMode(false);
          stdout.write("\nAbgebrochen.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (input.length) {
            input = input.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (ch < " ") continue; // übrige Steuerzeichen ignorieren
        input += ch;
        stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}
