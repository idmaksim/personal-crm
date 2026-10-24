CREATE TYPE "public"."contact_frequency" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "frequency" "contact_frequency";