-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductClassification" AS ENUM ('membership', 'event_entry', 'normal_product', 'ignore');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'expired', 'refunded', 'cancelled');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('applied', 'refunded', 'cancelled');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "shopify_customers" (
    "shopify_customer_id" TEXT NOT NULL,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "tags" TEXT,
    "state" TEXT,
    "default_address_json" JSONB,
    "raw_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_customers_pkey" PRIMARY KEY ("shopify_customer_id")
);

-- CreateTable
CREATE TABLE "shopify_orders" (
    "shopify_order_id" TEXT NOT NULL,
    "shopify_customer_id" TEXT,
    "order_number" TEXT,
    "email" TEXT,
    "financial_status" TEXT,
    "fulfillment_status" TEXT,
    "currency" TEXT,
    "subtotal_price" DECIMAL(12,2),
    "total_price" DECIMAL(12,2),
    "ordered_at" TIMESTAMP(3),
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_orders_pkey" PRIMARY KEY ("shopify_order_id")
);

-- CreateTable
CREATE TABLE "shopify_order_items" (
    "shopify_order_item_id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "variant_id" TEXT,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "variant_title" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2),
    "vendor" TEXT,
    "product_type" TEXT,
    "raw_json" JSONB NOT NULL,

    CONSTRAINT "shopify_order_items_pkey" PRIMARY KEY ("shopify_order_item_id")
);

-- CreateTable
CREATE TABLE "shopify_products" (
    "shopify_product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT,
    "product_type" TEXT,
    "tags" TEXT,
    "status" TEXT,
    "raw_json" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_products_pkey" PRIMARY KEY ("shopify_product_id")
);

-- CreateTable
CREATE TABLE "product_classifications" (
    "shopify_product_id" TEXT NOT NULL,
    "classification" "ProductClassification" NOT NULL,
    "event_name" TEXT,
    "event_date" TIMESTAMP(3),
    "event_category" TEXT,
    "event_venue_name" TEXT,
    "event_address" TEXT,
    "membership_plan_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_classifications_pkey" PRIMARY KEY ("shopify_product_id")
);

-- CreateTable
CREATE TABLE "member_profiles" (
    "member_id" TEXT NOT NULL,
    "shopify_customer_id" TEXT,
    "email" TEXT,
    "full_name" TEXT,
    "gender" TEXT,
    "birth_date" TIMESTAMP(3),
    "age_band" TEXT,
    "prefecture" TEXT,
    "region" TEXT,
    "profile_attributes_json" JSONB,
    "joined_at" TIMESTAMP(3),
    "first_membership_order_id" TEXT,
    "current_membership_status" "MembershipStatus",
    "last_membership_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_profiles_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "membership_purchases" (
    "membership_purchase_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "shopify_order_item_id" TEXT NOT NULL,
    "membership_plan_name" TEXT,
    "purchased_at" TIMESTAMP(3) NOT NULL,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "status" "MembershipStatus" NOT NULL,

    CONSTRAINT "membership_purchases_pkey" PRIMARY KEY ("membership_purchase_id")
);

-- CreateTable
CREATE TABLE "event_entries" (
    "event_entry_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "shopify_order_item_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "event_date" TIMESTAMP(3),
    "event_category" TEXT,
    "event_venue_name" TEXT,
    "event_address" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "EntryStatus" NOT NULL,

    CONSTRAINT "event_entries_pkey" PRIMARY KEY ("event_entry_id")
);

-- CreateTable
CREATE TABLE "contest_schedules" (
    "contest_schedule_id" TEXT NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "contest_name" TEXT NOT NULL,
    "venue_name" TEXT,
    "nearest_station" TEXT,
    "one_way_fare" TEXT,
    "travel_mode" TEXT,
    "travel_time" TEXT,
    "requires_hotel" BOOLEAN,
    "pre_travel_date" TIMESTAMP(3),
    "travel_description" TEXT,
    "address" TEXT,
    "phone_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_schedules_pkey" PRIMARY KEY ("contest_schedule_id")
);

-- CreateTable
CREATE TABLE "member_attribute_overrides" (
    "member_id" TEXT NOT NULL,
    "gender_override" TEXT,
    "birth_date_override" TIMESTAMP(3),
    "prefecture_override" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_attribute_overrides_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "sync_run_id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("sync_run_id")
);

-- CreateIndex
CREATE INDEX "shopify_customers_email_idx" ON "shopify_customers"("email");

-- CreateIndex
CREATE INDEX "shopify_orders_shopify_customer_id_ordered_at_idx" ON "shopify_orders"("shopify_customer_id", "ordered_at");

-- CreateIndex
CREATE INDEX "shopify_order_items_shopify_order_id_idx" ON "shopify_order_items"("shopify_order_id");

-- CreateIndex
CREATE INDEX "shopify_order_items_product_id_idx" ON "shopify_order_items"("product_id");

-- CreateIndex
CREATE INDEX "shopify_products_title_idx" ON "shopify_products"("title");

-- CreateIndex
CREATE INDEX "member_profiles_email_idx" ON "member_profiles"("email");

-- CreateIndex
CREATE INDEX "member_profiles_joined_at_idx" ON "member_profiles"("joined_at");

-- CreateIndex
CREATE INDEX "member_profiles_prefecture_age_band_gender_idx" ON "member_profiles"("prefecture", "age_band", "gender");

-- CreateIndex
CREATE UNIQUE INDEX "member_profiles_shopify_customer_id_key" ON "member_profiles"("shopify_customer_id");

-- CreateIndex
CREATE INDEX "membership_purchases_member_id_purchased_at_idx" ON "membership_purchases"("member_id", "purchased_at");

-- CreateIndex
CREATE UNIQUE INDEX "membership_purchases_shopify_order_item_id_key" ON "membership_purchases"("shopify_order_item_id");

-- CreateIndex
CREATE INDEX "event_entries_member_id_applied_at_idx" ON "event_entries"("member_id", "applied_at");

-- CreateIndex
CREATE INDEX "event_entries_event_name_event_date_idx" ON "event_entries"("event_name", "event_date");

-- CreateIndex
CREATE UNIQUE INDEX "event_entries_shopify_order_item_id_key" ON "event_entries"("shopify_order_item_id");

-- CreateIndex
CREATE INDEX "contest_schedules_contest_name_idx" ON "contest_schedules"("contest_name");

-- CreateIndex
CREATE UNIQUE INDEX "contest_schedules_contest_name_event_date_key" ON "contest_schedules"("contest_name", "event_date");

-- CreateIndex
CREATE INDEX "sync_runs_target_started_at_idx" ON "sync_runs"("target", "started_at");

-- AddForeignKey
ALTER TABLE "shopify_orders" ADD CONSTRAINT "shopify_orders_shopify_customer_id_fkey" FOREIGN KEY ("shopify_customer_id") REFERENCES "shopify_customers"("shopify_customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_order_items" ADD CONSTRAINT "shopify_order_items_shopify_order_id_fkey" FOREIGN KEY ("shopify_order_id") REFERENCES "shopify_orders"("shopify_order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_order_items" ADD CONSTRAINT "shopify_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shopify_products"("shopify_product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_classifications" ADD CONSTRAINT "product_classifications_shopify_product_id_fkey" FOREIGN KEY ("shopify_product_id") REFERENCES "shopify_products"("shopify_product_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_shopify_customer_id_fkey" FOREIGN KEY ("shopify_customer_id") REFERENCES "shopify_customers"("shopify_customer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_first_membership_order_id_fkey" FOREIGN KEY ("first_membership_order_id") REFERENCES "shopify_orders"("shopify_order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_purchases" ADD CONSTRAINT "membership_purchases_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("member_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_purchases" ADD CONSTRAINT "membership_purchases_shopify_order_id_fkey" FOREIGN KEY ("shopify_order_id") REFERENCES "shopify_orders"("shopify_order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_purchases" ADD CONSTRAINT "membership_purchases_shopify_order_item_id_fkey" FOREIGN KEY ("shopify_order_item_id") REFERENCES "shopify_order_items"("shopify_order_item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_entries" ADD CONSTRAINT "event_entries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("member_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_entries" ADD CONSTRAINT "event_entries_shopify_order_id_fkey" FOREIGN KEY ("shopify_order_id") REFERENCES "shopify_orders"("shopify_order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_entries" ADD CONSTRAINT "event_entries_shopify_order_item_id_fkey" FOREIGN KEY ("shopify_order_item_id") REFERENCES "shopify_order_items"("shopify_order_item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_attribute_overrides" ADD CONSTRAINT "member_attribute_overrides_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member_profiles"("member_id") ON DELETE CASCADE ON UPDATE CASCADE;

