import { login, me, register, setName, Me } from "../net/api.js";

// Runs the auth + display-name flow inside `ui`; resolves with the player profile.
export async function runAuthFlow(ui: HTMLElement): Promise<Me> {
  let session = await me();
  if (!session) session = await showAuthPanel(ui);
  if (!session.player) session = await showNamePanel(ui);
  return session;
}

function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function showAuthPanel(ui: HTMLElement): Promise<Me> {
  return new Promise((resolve) => {
    let mode: "login" | "register" = "login";
    const wrap = el(`
      <div class="center-wrap">
        <div class="panel auth-panel">
          <div class="wordmark">MERCHANT CITY</div>
          <div class="tagline">ONE ECONOMY · EVERYTHING IS AN ASSET</div>
          <div class="tabs">
            <button data-mode="login" class="active">Log in</button>
            <button data-mode="register">Create account</button>
          </div>
          <div class="field"><label>EMAIL</label><input name="email" type="email" autocomplete="email" /></div>
          <div class="field"><label>PASSWORD</label><input name="password" type="password" autocomplete="current-password" /></div>
          <button class="btn-primary">Enter the city</button>
          <div class="auth-error"></div>
          <div class="hint-text">New accounts start with $10,000 in cash.</div>
        </div>
      </div>`);
    ui.appendChild(wrap);

    const tabs = wrap.querySelectorAll<HTMLButtonElement>(".tabs button");
    const err = wrap.querySelector<HTMLElement>(".auth-error")!;
    const submit = wrap.querySelector<HTMLButtonElement>(".btn-primary")!;
    const email = wrap.querySelector<HTMLInputElement>('input[name="email"]')!;
    const password = wrap.querySelector<HTMLInputElement>('input[name="password"]')!;

    tabs.forEach((b) =>
      b.addEventListener("click", () => {
        mode = b.dataset.mode as typeof mode;
        tabs.forEach((x) => x.classList.toggle("active", x === b));
        submit.textContent = mode === "login" ? "Enter the city" : "Create account";
        err.textContent = "";
      })
    );

    const go = async () => {
      err.textContent = "";
      submit.disabled = true;
      try {
        if (mode === "login") await login(email.value.trim(), password.value);
        else await register(email.value.trim(), password.value);
        const session = await me();
        if (!session) throw new Error("session error — try again");
        wrap.remove();
        resolve(session);
      } catch (e: any) {
        err.textContent = e.message ?? "something went wrong";
      } finally {
        submit.disabled = false;
      }
    };
    submit.addEventListener("click", go);
    wrap.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") go();
    });
    email.focus();
  });
}

function showNamePanel(ui: HTMLElement): Promise<Me> {
  return new Promise((resolve) => {
    const wrap = el(`
      <div class="center-wrap">
        <div class="panel auth-panel">
          <div class="wordmark">CHOOSE A NAME</div>
          <div class="tagline">SHOWN ABOVE YOUR CHARACTER AND ON EVERY DEED</div>
          <div class="field"><label>DISPLAY NAME</label><input name="name" maxlength="16" autocomplete="off" spellcheck="false" /></div>
          <button class="btn-primary">Claim name</button>
          <div class="auth-error"></div>
          <div class="hint-text">3–16 characters. Letters, numbers, underscore. Permanent.</div>
        </div>
      </div>`);
    ui.appendChild(wrap);
    const err = wrap.querySelector<HTMLElement>(".auth-error")!;
    const submit = wrap.querySelector<HTMLButtonElement>(".btn-primary")!;
    const name = wrap.querySelector<HTMLInputElement>('input[name="name"]')!;
    const go = async () => {
      err.textContent = "";
      submit.disabled = true;
      try {
        await setName(name.value.trim());
        const session = await me();
        if (!session?.player) throw new Error("session error — try again");
        wrap.remove();
        resolve(session);
      } catch (e: any) {
        err.textContent = e.message ?? "something went wrong";
      } finally {
        submit.disabled = false;
      }
    };
    submit.addEventListener("click", go);
    wrap.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") go();
    });
    name.focus();
  });
}
