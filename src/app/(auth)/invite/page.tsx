import Link from "next/link";
import { AuthShell } from "../_components/auth-shell";
import { joinWithCodeAction } from "./actions";
import { JoinForm } from "./join-form";

export default function JoinPage() {
  return (
    <AuthShell
      title="Dołącz do panelu klienta"
      description="Wpisz kod zaproszenia od swojego trenera albo zeskanuj kod QR."
      footer={
        <span>
          Masz już konto?{" "}
          <Link href="/login" className="underline">
            Zaloguj się
          </Link>
        </span>
      }
    >
      <JoinForm action={joinWithCodeAction} />
    </AuthShell>
  );
}
