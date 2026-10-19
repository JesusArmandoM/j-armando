CREATE TABLE "size_chart" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"size" "variant_size" NOT NULL,
	"measurements" jsonb NOT NULL,
	CONSTRAINT "uq_size_chart_category_size" UNIQUE("category_id","size")
);
--> statement-breakpoint
ALTER TABLE "size_chart" ADD CONSTRAINT "size_chart_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;