"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { isMagicLinkRateLimited } from "@/lib/magic-link-limit";

export type LoginActionState = { error?: string; message?: string } | undefined;

export async function requestMagicLink(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  if (!isValidEmail(email)) {
    return { error: "Проверь адрес почты" };
  }

  if (await isMagicLinkRateLimited(email)) {
    return { error: "Слишком часто, попробуй через несколько минут" };
  }

  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: "/",
        errorCallbackURL: "/login?expired=1",
      },
      headers: await headers(),
    });
  } catch (error) {
    console.error("requestMagicLink failed:", error);
    return { error: "Не удалось отправить письмо. Попробуйте ещё раз." };
  }

  return { message: `Ссылка для входа отправлена на ${email}` };
}
