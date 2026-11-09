CREATE TABLE "magic_link_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "magic_link_requests_email_created_at_idx" ON "magic_link_requests" USING btree ("email","created_at");