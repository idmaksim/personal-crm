ALTER TABLE "contacts" ADD COLUMN "birth_day" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_month" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_valid" CHECK (("contacts"."birth_day" is null) = ("contacts"."birth_month" is null)
        and ("contacts"."birth_year" is null or "contacts"."birth_day" is not null)
        and ("contacts"."birth_day" is null or "contacts"."birth_day" between 1 and 31)
        and ("contacts"."birth_month" is null or "contacts"."birth_month" between 1 and 12)
        and ("contacts"."birth_year" is null or "contacts"."birth_year" between 1900 and 2100));