import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Вход</CardTitle>
        </CardHeader>
        <CardContent>
          {expired ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ссылка устарела, запроси новую
              </p>
              <Button asChild className="w-full">
                <Link href="/login">Запросить новую ссылку</Link>
              </Button>
            </div>
          ) : (
            <LoginForm />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
