ALTER TYPE "public"."fulfillment_status" ADD VALUE 'unfulfilled' BEFORE 'preparing';--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "account_id" DROP NOT NULL;