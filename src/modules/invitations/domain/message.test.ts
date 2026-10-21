import { describe, expect, it } from "vitest";
import { createFormats } from "@/shared/i18n/formats";
import { translatorFor } from "@/shared/i18n/translator";
import { composeInvitationMessage, composeMemberInvitationMessage } from "./message";

const input = {
  organizationName: "Szkoła <Łapa>",
  clientFirstName: "Anna",
  link: "https://app.example.pl/invite/abc",
  code: "ABCDE-FGHJK",
  expiresAt: new Date("2026-10-23T10:00:00Z"),
  packageName: "Pakiet 10",
};

const pl = async () => ({ t: await translatorFor("pl"), formats: createFormats("pl") });

describe("composeInvitationMessage", () => {
  it("zawiera link, kod i termin we wszystkich wariantach", async () => {
    const { t, formats } = await pl();
    const message = composeInvitationMessage(input, t, formats);
    for (const body of [message.text, message.html]) {
      expect(body).toContain("https://app.example.pl/invite/abc");
      expect(body).toContain("ABCDE-FGHJK");
      expect(body).toContain("23.10.2026");
    }
    expect(message.subject).toContain("Szkoła <Łapa>");
    expect(message.text).toContain("Cześć Anna!");
    expect(message.text).toContain("Pakiet 10");
  });

  it("escapuje HTML w nazwie organizacji", async () => {
    const { t, formats } = await pl();
    expect(composeInvitationMessage(input, t, formats).html).toContain("Szkoła &lt;Łapa&gt;");
  });

  it("działa bez imienia i pakietu", async () => {
    const { t, formats } = await pl();
    const message = composeInvitationMessage({ ...input, clientFirstName: "", packageName: null }, t, formats);
    expect(message.text.startsWith("Cześć!")).toBe(true);
    expect(message.text).not.toContain("pakiet „");
  });

  it("zachowuje dotychczasową treść po polsku", async () => {
    const { t, formats } = await pl();
    const message = composeInvitationMessage(input, t, formats);
    expect(message.subject).toBe("Zaproszenie do panelu klienta: Szkoła <Łapa>");
    expect(message.text).toContain("Szkoła <Łapa> zaprasza Cię do panelu klienta (pakiet „Pakiet 10”), gdzie zobaczysz saldo zajęć, płatności i terminy.");
    expect(message.text).toContain("Otwórz link: https://app.example.pl/invite/abc");
    expect(message.text).toContain("Albo wejdź na stronę /invite i wpisz kod: ABCDE-FGHJK");
    expect(message.text).toContain("Zaproszenie jest ważne do 23.10.2026.");
    expect(message.html).toContain(">Przyjmij zaproszenie</a>");
  });
});

describe("composeMemberInvitationMessage", () => {
  it("podaje rolę w języku wiadomości i termin", async () => {
    const { t, formats } = await pl();
    const message = composeMemberInvitationMessage(
      { organizationName: "Łapa", role: "assistant", link: "https://app.example.pl/join/x", expiresAt: input.expiresAt },
      t,
      formats,
    );
    expect(message.subject).toBe("Zaproszenie do zespołu: Łapa");
    expect(message.text).toContain("Łapa zaprasza Cię do zespołu w DogTrainer jako: Asystent.");
    expect(message.text).toContain("https://app.example.pl/join/x");
    expect(message.text).toContain("Zaproszenie jest ważne do 23.10.2026.");
  });
});
