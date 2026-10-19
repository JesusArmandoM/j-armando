CREATE TABLE "checkout_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"email" text NOT NULL,
	"recipient_name" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" char(2) NOT NULL,
	"zip" text NOT NULL,
	"country" char(2) DEFAULT 'US' NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_session_cart_id_unique" UNIQUE("cart_id")
);
--> statement-breakpoint
ALTER TABLE "address" ADD COLUMN "recipient_name" text;--> statement-breakpoint
ALTER TABLE "checkout_session" ADD CONSTRAINT "checkout_session_cart_id_cart_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."cart"("id") ON DELETE cascade ON UPDATE no action;