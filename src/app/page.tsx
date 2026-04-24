import { redirect } from "next/navigation";
import { getCurrentUser, getRoleHomePath } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? getRoleHomePath(user.role) : "/login");
}
