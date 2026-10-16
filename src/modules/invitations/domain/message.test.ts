import { describe, expect, it } from "vitest";
import { composeInvitationMessage } from "./message";

const input = {
  organizationName: "Szkoła <Łapa>",
  clientFirstName: "Anna",
  link: "https://app.example.pl/invite/abc",
  code: "ABCDE-FGHJK",
  expiresAt: new Date("2026-10-23T10:00:00Z"),
  packageName: "Pakiet 10",
};

describe("composeInvitationMessage", () => {
  it("zawiera link, kod i termin we wszystkich wariantach", () => {
    const message = composeInvitationMessage(input);
    for (const body of [message.text, message.html, message.sms]) {
      expect(body).toContain("https://app.example.pl/invite/abc");
      expect(body).toContain("ABCDE-FGHJK");
      expect(body).toContain("23.10.2026");
    }
    expect(message.subject).toContain("Szkoła <Łapa>");
    expect(message.text).toContain("Cześć Anna!");
    expect(message.text).toContain("Pakiet 10");
  });

  it("escapuje HTML w nazwie organizacji", () => {
    expect(composeInvitationMessage(input).html).toContain("Szkoła &lt;Łapa&gt;");
  });

  it("działa bez imienia i pakietu", () => {
    const message = composeInvitationMessage({ ...input, clientFirstName: "", packageName: null });
    expect(message.text.startsWith("Cześć!")).toBe(true);
    expect(message.text).not.toContain("pakiet „");
  });
});
