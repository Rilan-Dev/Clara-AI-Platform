import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { APP_COOKIE_NAME } from "@/config/app";

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_COOKIE_NAME)?.value;

  redirect(token ? "/dashboard" : "/login");
}
