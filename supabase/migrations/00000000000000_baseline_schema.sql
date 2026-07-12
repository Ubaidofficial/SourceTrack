


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."claim_revenue_idempotency_keys"("p_site_key" "text", "p_provider" "text", "p_keys" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  item jsonb;
  v_key_type text;
  v_key_value text;
BEGIN
  IF p_site_key IS NULL OR length(trim(p_site_key)) = 0 THEN
    RAISE EXCEPTION 'site_key is required';
  END IF;

  IF p_provider IS NULL OR length(trim(p_provider)) = 0 THEN
    RAISE EXCEPTION 'provider is required';
  END IF;

  IF p_keys IS NULL OR jsonb_typeof(p_keys) <> 'array' OR jsonb_array_length(p_keys) = 0 THEN
    RAISE EXCEPTION 'keys array is required';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_keys) LOOP
    v_key_type := item->>'key_type';
    v_key_value := item->>'key_value';

    IF v_key_type IS NULL OR length(trim(v_key_type)) = 0 THEN
      RAISE EXCEPTION 'key_type is required';
    END IF;

    IF v_key_value IS NULL OR length(trim(v_key_value)) = 0 THEN
      RAISE EXCEPTION 'key_value is required';
    END IF;

    INSERT INTO public.revenue_idempotency_keys (
      site_key,
      provider,
      key_type,
      key_value
    )
    VALUES (
      trim(p_site_key),
      trim(p_provider),
      trim(v_key_type),
      trim(v_key_value)
    );
  END LOOP;

  RETURN true;

EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."claim_revenue_idempotency_keys"("p_site_key" "text", "p_provider" "text", "p_keys" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_site_conversion_usage"("p_site_id" "uuid", "p_month" character varying, "p_limit" integer) RETURNS TABLE("allowed" boolean, "current_count" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_current_count INTEGER;
BEGIN
  -- Validate inputs
  IF p_site_id IS NULL OR p_month IS NULL OR p_limit IS NULL OR p_limit < 0 THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  -- Seed row if missing (use ON CONFLICT DO NOTHING to avoid duplicate errors)
  INSERT INTO site_usage_monthly (site_id, month, conversion_count)
  VALUES (p_site_id, p_month, 0)
  ON CONFLICT (site_id, month) DO NOTHING;

  -- Lock the row for update to ensure concurrency safety
  SELECT conversion_count INTO v_current_count
  FROM site_usage_monthly
  WHERE site_id = p_site_id AND month = p_month
  FOR UPDATE;

  -- Check limit
  IF v_current_count >= p_limit THEN
    RETURN QUERY SELECT FALSE, v_current_count;
  ELSE
    -- Increment count and return the updated count
    UPDATE site_usage_monthly
    SET conversion_count = conversion_count + 1, updated_at = now()
    WHERE site_id = p_site_id AND month = p_month
    RETURNING conversion_count INTO v_current_count;

    RETURN QUERY SELECT TRUE, v_current_count;
  END IF;
END;
$$;


ALTER FUNCTION "public"."claim_site_conversion_usage"("p_site_id" "uuid", "p_month" character varying, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_site_pageview_usage"("p_site_id" "uuid", "p_month" character varying, "p_limit" integer) RETURNS TABLE("allowed" boolean, "current_count" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_current_count INTEGER;
BEGIN
  -- Validate inputs
  IF p_site_id IS NULL OR p_month IS NULL OR p_limit IS NULL OR p_limit < 0 THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  -- Seed row if missing (use ON CONFLICT DO NOTHING to avoid duplicate errors).
  -- Shares the same row as claim_site_conversion_usage for this site+month.
  INSERT INTO site_usage_monthly (site_id, month, conversion_count, pageview_count)
  VALUES (p_site_id, p_month, 0, 0)
  ON CONFLICT (site_id, month) DO NOTHING;

  -- Lock the row for update to ensure concurrency safety
  SELECT pageview_count INTO v_current_count
  FROM site_usage_monthly
  WHERE site_id = p_site_id AND month = p_month
  FOR UPDATE;

  -- Check limit
  IF v_current_count >= p_limit THEN
    RETURN QUERY SELECT FALSE, v_current_count;
  ELSE
    -- Atomic increment and return updated count
    UPDATE site_usage_monthly
    SET pageview_count = pageview_count + 1, updated_at = now()
    WHERE site_id = p_site_id AND month = p_month
    RETURNING pageview_count INTO v_current_count;

    RETURN QUERY SELECT TRUE, v_current_count;
  END IF;
END;
$$;


ALTER FUNCTION "public"."claim_site_pageview_usage"("p_site_id" "uuid", "p_month" character varying, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_monthly_pageviews"("p_site_id" "uuid", "p_month_start" timestamp with time zone) RETURNS bigint
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(COUNT(*), 0)::bigint
  FROM pageviews
  WHERE site_id = p_site_id
    AND timestamp >= p_month_start;
$$;


ALTER FUNCTION "public"."count_monthly_pageviews"("p_site_id" "uuid", "p_month_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_monthly_sessions"("p_site_id" "uuid", "p_month_start" timestamp with time zone) RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
    SELECT COUNT(DISTINCT session_id)::INTEGER
    FROM pageviews
    WHERE site_id    = p_site_id
      AND timestamp  >= p_month_start
      AND session_id IS NOT NULL;
  $$;


ALTER FUNCTION "public"."count_monthly_sessions"("p_site_id" "uuid", "p_month_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_free_tier_abuse_guards"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_email          text;
  v_email_domain   text;
  v_clean_domain   text;
  v_match_suffix   text;
BEGIN
  IF NEW.plan IS DISTINCT FROM 'free' THEN
    RETURN NEW;
  END IF;

  IF NEW.domain IS NOT NULL AND length(trim(NEW.domain)) > 0 THEN
    v_clean_domain := lower(trim(NEW.domain));
    v_clean_domain := regexp_replace(v_clean_domain, '^https?://', '');
    v_clean_domain := split_part(v_clean_domain, '/', 1);

    SELECT suffix INTO v_match_suffix
    FROM paas_subdomain_blocklist
    WHERE v_clean_domain LIKE '%' || suffix
      AND length(v_clean_domain) > length(suffix)
    LIMIT 1;

    IF v_match_suffix IS NOT NULL THEN
      RAISE EXCEPTION 'Free tier does not allow PaaS subdomains (%). Use a custom domain or upgrade to a paid plan.', v_match_suffix
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.owner_id IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = NEW.owner_id;
    IF v_email IS NOT NULL THEN
      v_email_domain := lower(split_part(v_email, '@', 2));
      IF EXISTS (SELECT 1 FROM disposable_email_domains WHERE domain = v_email_domain) THEN
        RAISE EXCEPTION 'Disposable email addresses are not allowed on the free tier. Use a real work or personal email.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_free_tier_abuse_guards"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."enforce_free_tier_abuse_guards"() IS 'Blocks free-tier signups using disposable emails or PaaS subdomain farms. Paid plans skip the check.';



CREATE OR REPLACE FUNCTION "public"."set_managed_proxy_domains_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_managed_proxy_domains_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ad_platform_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "account_id" "text",
    "account_name" "text",
    "encrypted_refresh_token" "text",
    "encrypted_access_token" "text",
    "login_customer_id" "text",
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "last_error_code" "text",
    "last_error_message" "text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ad_platform_connections_platform_check" CHECK (("platform" = ANY (ARRAY['google_ads'::"text", 'meta_ads'::"text"]))),
    CONSTRAINT "ad_platform_connections_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'needs_account'::"text", 'needs_reconnect'::"text", 'error'::"text"]))),
    CONSTRAINT "chk_google_credentials" CHECK ((("platform" <> 'google_ads'::"text") OR ((("status" = 'needs_account'::"text") AND ("encrypted_refresh_token" IS NOT NULL)) OR (("status" = 'connected'::"text") AND ("encrypted_refresh_token" IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM "account_id"), ''::"text") IS NOT NULL)) OR ("status" = ANY (ARRAY['needs_reconnect'::"text", 'error'::"text"]))))),
    CONSTRAINT "chk_meta_credentials" CHECK ((("platform" <> 'meta_ads'::"text") OR (("status" <> 'needs_account'::"text") AND (("status" <> 'connected'::"text") OR (("encrypted_access_token" IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM "account_id"), ''::"text") IS NOT NULL))))))
);


ALTER TABLE "public"."ad_platform_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ad_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "source" "text" DEFAULT 'csv_import'::"text" NOT NULL,
    "sync_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_end" timestamp with time zone,
    "status" "text" NOT NULL,
    "records_synced" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "sync_type" "text" NOT NULL,
    CONSTRAINT "ad_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'success'::"text", 'failed'::"text"]))),
    CONSTRAINT "ad_sync_runs_sync_type_check" CHECK (("sync_type" = ANY (ARRAY['manual'::"text", 'daily'::"text"])))
);


ALTER TABLE "public"."ad_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "admin_user_id" "uuid",
    "action" "text",
    "target_type" "text",
    "target_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."annotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "note" "text" NOT NULL,
    "type" "text" DEFAULT 'note'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "annotations_type_check" CHECK (("type" = ANY (ARRAY['note'::"text", 'deploy'::"text", 'campaign'::"text", 'alert'::"text"])))
);


ALTER TABLE "public"."annotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "owner_id" "uuid",
    "key_prefix" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "name" "text" DEFAULT 'Server API Token'::"text" NOT NULL,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attributed_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "conversion_event_id" "text" NOT NULL,
    "distinct_id" "text" NOT NULL,
    "conversion_date" "date" NOT NULL,
    "conversion_timestamp" timestamp with time zone NOT NULL,
    "conversion_type" "text",
    "conversion_value" numeric(10,2) DEFAULT 0,
    "first_touch_source" "text",
    "first_touch_medium" "text",
    "first_touch_campaign" "text",
    "first_touch_timestamp" timestamp with time zone,
    "last_touch_source" "text",
    "last_touch_medium" "text",
    "last_touch_campaign" "text",
    "last_touch_timestamp" timestamp with time zone,
    "linear_attribution" "jsonb",
    "touchpoint_count" integer DEFAULT 0,
    "processed_at" timestamp with time zone DEFAULT "now"(),
    "processing_version" "text" DEFAULT '1.0'::"text",
    "channel" "text",
    "channel_30d" "text",
    "status" "text" DEFAULT 'lead'::"text",
    "qualified_at" timestamp with time zone,
    "qualified_by" "text",
    "first_touch_channel" "text",
    "last_touch_channel" "text",
    "attribution_confidence" integer DEFAULT 50,
    "confidence_signals" "jsonb",
    "external_event_id" "text",
    "dedup_count" integer DEFAULT 0,
    "u_shaped_attribution" "jsonb",
    "anonymous_id" "text",
    "time_decay_attribution" "jsonb",
    "w_shaped_attribution" "jsonb",
    "custom_properties" "jsonb",
    "first_touch_country" "text",
    "last_touch_country" "text",
    "first_touch_device" "text",
    "last_touch_device" "text",
    "first_touch_browser" "text",
    "last_touch_browser" "text",
    "first_touch_landing_page" "text",
    "last_touch_landing_page" "text",
    "ai_influenced_source" "text",
    "ai_influenced_session_at" timestamp with time zone,
    CONSTRAINT "attributed_conversions_status_check" CHECK (("status" = ANY (ARRAY['lead'::"text", 'mql'::"text", 'sql'::"text", 'customer'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."attributed_conversions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "campaign_name" "text" NOT NULL,
    "spend" numeric(10,2) DEFAULT 0,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "platform" "text" DEFAULT 'manual'::"text" NOT NULL,
    "campaign_id" "text",
    "cost_dedupe_key" "text" NOT NULL,
    "clicks" integer DEFAULT 0,
    "impressions" integer DEFAULT 0,
    "currency" character varying(3) DEFAULT 'USD'::character varying,
    CONSTRAINT "campaign_costs_clicks_nonnegative" CHECK (("clicks" >= 0)),
    CONSTRAINT "campaign_costs_currency_format" CHECK ((("currency")::"text" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "campaign_costs_impressions_nonnegative" CHECK (("impressions" >= 0))
);


ALTER TABLE "public"."campaign_costs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."capi_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "event_ref" "text",
    "status" "text" NOT NULL,
    "http_status" integer,
    "error_message" "text",
    "attempt" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "capi_deliveries_platform_check" CHECK (("platform" = ANY (ARRAY['meta'::"text", 'google'::"text", 'microsoft'::"text", 'linkedin'::"text", 'tiktok'::"text"]))),
    CONSTRAINT "capi_deliveries_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."capi_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "company_id" "uuid",
    "user_id" "uuid",
    "role" "text" DEFAULT 'user'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."company_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "text",
    "event_type" "text" NOT NULL,
    "event_name" "text",
    "url" "text",
    "session_id" "text",
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."custom_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_widgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "owner_id" "uuid",
    "widget_type" "text",
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "position" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dashboard_widgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_quality_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "severity" "text",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "is_resolved" boolean DEFAULT false,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "data_quality_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."data_quality_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_quality_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "check_name" "text" NOT NULL,
    "status" "text",
    "value" numeric,
    "threshold" numeric,
    "message" "text",
    "checked_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "data_quality_reports_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'warning'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."data_quality_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disposable_email_domains" (
    "domain" "text" NOT NULL
);


ALTER TABLE "public"."disposable_email_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gsc_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "property_url" "text",
    "encrypted_refresh_token" "text",
    "google_account_email" "text",
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "last_error_code" "text",
    "last_error_message" "text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_refresh_token_if_connected" CHECK ((("status" <> 'connected'::"text") OR ("encrypted_refresh_token" IS NOT NULL))),
    CONSTRAINT "gsc_connections_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'needs_reconnect'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."gsc_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gsc_performance_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "property_url" "text" NOT NULL,
    "date" "date" NOT NULL,
    "query" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_path" "text" NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "ctr" numeric DEFAULT 0 NOT NULL,
    "position" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gsc_performance_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gsc_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "property_url" "text" NOT NULL,
    "sync_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_end" timestamp with time zone,
    "status" "text" NOT NULL,
    "records_synced" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "sync_type" "text" NOT NULL,
    CONSTRAINT "gsc_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'success'::"text", 'failed'::"text"]))),
    CONSTRAINT "gsc_sync_runs_sync_type_check" CHECK (("sync_type" = ANY (ARRAY['manual'::"text", 'daily'::"text"])))
);


ALTER TABLE "public"."gsc_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "conversions_processed" integer DEFAULT 0,
    "error_message" "text",
    "duration_ms" integer,
    "ran_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "job_runs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failed'::"text", 'partial'::"text"])))
);


ALTER TABLE "public"."job_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_qualifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "qualified" boolean DEFAULT true,
    "qualified_by" "text",
    "qualified_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "status" "text"
);


ALTER TABLE "public"."lead_qualifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."managed_proxy_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "status" "text" DEFAULT 'pending_dns'::"text" NOT NULL,
    "cname_target" "text" NOT NULL,
    "verified_at" timestamp with time zone,
    "last_checked_at" timestamp with time zone,
    "error_code" "text",
    "error_message" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "managed_proxy_domains_cname_target_not_empty" CHECK (("btrim"("cname_target") <> ''::"text")),
    CONSTRAINT "managed_proxy_domains_domain_lowercase" CHECK (("domain" = "lower"("domain"))),
    CONSTRAINT "managed_proxy_domains_domain_not_empty" CHECK (("btrim"("domain") <> ''::"text")),
    CONSTRAINT "managed_proxy_domains_status_check" CHECK (("status" = ANY (ARRAY['pending_dns'::"text", 'pending_ssl_or_routing'::"text", 'active'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."managed_proxy_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."paas_subdomain_blocklist" (
    "suffix" "text" NOT NULL
);


ALTER TABLE "public"."paas_subdomain_blocklist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pageviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "country" "text",
    "device" "text",
    "browser" "text",
    "session_id" "text",
    "duration_seconds" integer DEFAULT 0,
    "ai_source" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "entry_page" "text",
    "exit_page" "text"
);


ALTER TABLE "public"."pageviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qa_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "feature_key" "text",
    "note_type" "text",
    "note_text" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."qa_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."revenue_idempotency_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "key_type" "text" NOT NULL,
    "key_value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "revenue_idempotency_key_type_not_blank" CHECK (("length"(TRIM(BOTH FROM "key_type")) > 0)),
    CONSTRAINT "revenue_idempotency_key_value_not_blank" CHECK (("length"(TRIM(BOTH FROM "key_value")) > 0)),
    CONSTRAINT "revenue_idempotency_provider_not_blank" CHECK (("length"(TRIM(BOTH FROM "provider")) > 0))
);


ALTER TABLE "public"."revenue_idempotency_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."revenue_ingestion_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_event_id" "text",
    "order_id" "text",
    "payment_id" "text",
    "idempotency_key" "text",
    "event_type" "text",
    "value" numeric,
    "currency" "text",
    "status" "text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "revenue_ingestion_events_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'duplicate'::"text", 'error'::"text"]))),
    CONSTRAINT "revenue_ingestion_provider_not_blank" CHECK (("length"(TRIM(BOTH FROM "provider")) > 0))
);


ALTER TABLE "public"."revenue_ingestion_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "user_id" "uuid",
    "site_id" "uuid",
    "name" "text",
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "show_on_dashboard" boolean DEFAULT false NOT NULL,
    "dashboard_position" integer DEFAULT 0 NOT NULL,
    "dashboard_size" "text" DEFAULT 'medium'::"text" NOT NULL,
    CONSTRAINT "saved_reports_dashboard_size_check" CHECK (("dashboard_size" = ANY (ARRAY['small'::"text", 'medium'::"text", 'large'::"text"])))
);


ALTER TABLE "public"."saved_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid",
    "type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "data_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "dismissed_at" timestamp with time zone
);


ALTER TABLE "public"."site_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_annotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "annotation_date" "date" NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."site_annotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_identity_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "anonymous_id" "text" NOT NULL,
    "source" "text" DEFAULT 'identify'::"text" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "site_identity_links_anonymous_id_check" CHECK ((("length"(TRIM(BOTH FROM "anonymous_id")) > 0) AND ("length"("anonymous_id") <= 256))),
    CONSTRAINT "site_identity_links_no_self_link" CHECK (("user_id" <> "anonymous_id")),
    CONSTRAINT "site_identity_links_source_check" CHECK (("source" = ANY (ARRAY['identify'::"text", 'browser_conversion'::"text", 'offline_conversion'::"text", 'server_event'::"text"]))),
    CONSTRAINT "site_identity_links_user_id_check" CHECK ((("length"(TRIM(BOTH FROM "user_id")) > 0) AND ("length"("user_id") <= 256)))
);


ALTER TABLE "public"."site_identity_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_usage_monthly" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "month" character varying(7) NOT NULL,
    "conversion_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pageview_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "site_usage_monthly_conversion_count_check" CHECK (("conversion_count" >= 0)),
    CONSTRAINT "site_usage_monthly_month_check" CHECK ((("month")::"text" ~ '^[0-9]{4}-[0-9]{2}$'::"text")),
    CONSTRAINT "site_usage_monthly_pageview_count_check" CHECK (("pageview_count" >= 0))
);


ALTER TABLE "public"."site_usage_monthly" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sites" (
    "site_key" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "name" "text" NOT NULL,
    "domain" "text",
    "owner_id" "uuid" DEFAULT "gen_random_uuid"(),
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "plan" "text" DEFAULT 'free'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "company_id" "uuid",
    "stripe_customer_id" "text",
    "onboarding_completed" boolean DEFAULT false,
    "onboarding_state" "jsonb" DEFAULT '{}'::"jsonb",
    "api_key" "text" DEFAULT ("gen_random_uuid"())::"text",
    "meta_pixel_id" "text",
    "meta_capi_token" "text",
    "google_ads_customer_id" "text",
    "google_ads_conversion_action_id" "text",
    "google_ads_developer_token" "text",
    "microsoft_tag_id" "text",
    "microsoft_capi_token" "text",
    "linkedin_partner_id" "text",
    "linkedin_capi_token" "text",
    "business_type" "text" DEFAULT 'saas'::"text",
    "public_share_token" "text" DEFAULT ("gen_random_uuid"())::"text",
    "public_share_enabled" boolean DEFAULT false,
    "custom_domain" "text",
    "custom_domain_verified" boolean DEFAULT false,
    "trial_ends_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval),
    "trial_started_at" timestamp with time zone DEFAULT "now"(),
    "cookieless_mode" boolean DEFAULT false NOT NULL,
    "data_retention_days" integer,
    "attribution_window_days" integer DEFAULT 30 NOT NULL,
    "pv_limit" integer DEFAULT 5000,
    "last_seen_at" timestamp with time zone,
    "excluded_paths" "text"[] DEFAULT '{}'::"text"[],
    "timezone" "text" DEFAULT 'UTC'::"text",
    "api_key_hash" "text",
    "encrypted_stripe_webhook_secret" "text",
    "encrypted_shopify_shared_secret" "text",
    "custom_url_params" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "cross_domain_domains" "text"[],
    "cross_domain_cookie_domain" "text",
    "stripe_subscription_id" "text",
    CONSTRAINT "sites_business_type_check" CHECK (("business_type" = ANY (ARRAY['saas'::"text", 'ecommerce'::"text", 'leadgen'::"text"]))),
    CONSTRAINT "sites_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'trial'::"text", 'starter'::"text", 'growth'::"text", 'business'::"text", 'inactive'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."sites" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sites"."pv_limit" IS 'Monthly pageview cap for this site. Free=5K, Starter@10K=10K, Starter@50K=50K, etc. Set by Stripe webhook from price metadata.';



COMMENT ON COLUMN "public"."sites"."last_seen_at" IS 'Last pageview ingest timestamp. Updated by tracker ingest. Used to auto-archive free accounts inactive for 60+ days.';



CREATE TABLE IF NOT EXISTS "public"."subscription_identity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "first_touch_source" "text",
    "first_touch_channel" "text",
    "first_touch_campaign" "text",
    "last_touch_source" "text",
    "last_touch_channel" "text",
    "attribution_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "anonymous_id" "text",
    "first_subscription_id" "text",
    "source_conversion_id" "uuid",
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_locked_at" timestamp with time zone
);


ALTER TABLE "public"."subscription_identity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_revenue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "stripe_subscription_id" "text",
    "invoice_id" "text",
    "event_type" "text" NOT NULL,
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "first_touch_source" "text",
    "first_touch_channel" "text",
    "attribution_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "provider_event_id" "text",
    "source_conversion_id" "uuid",
    "occurred_at" timestamp with time zone NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dedup_key" "text" NOT NULL,
    CONSTRAINT "subscription_revenue_event_type_check" CHECK (("event_type" = ANY (ARRAY['subscription'::"text", 'renewal'::"text", 'trial_start'::"text", 'trial_converted'::"text", 'churn'::"text"])))
);


ALTER TABLE "public"."subscription_revenue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tinybird_revenue_idempotency_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tinybird_revenue_idempotency_keys_event_id_check" CHECK (("event_id" <> ''::"text")),
    CONSTRAINT "tinybird_revenue_idempotency_keys_site_id_check" CHECK (("site_id" <> ''::"text"))
);


ALTER TABLE "public"."tinybird_revenue_idempotency_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_email_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "threshold" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."usage_email_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_email_log" IS 'Idempotency log for the usage-threshold-emails job. Prevents resending the same threshold email within a month.';



CREATE TABLE IF NOT EXISTS "public"."webhook_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "destination_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "status_code" integer,
    "success" boolean NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_destinations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_key" "text" NOT NULL,
    "url" "text" NOT NULL,
    "secret" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_destinations" OWNER TO "postgres";


ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "DB_1_pkey" PRIMARY KEY ("site_key");



ALTER TABLE ONLY "public"."ad_platform_connections"
    ADD CONSTRAINT "ad_platform_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ad_platform_connections"
    ADD CONSTRAINT "ad_platform_connections_site_platform_key" UNIQUE ("site_key", "platform");



ALTER TABLE ONLY "public"."ad_sync_runs"
    ADD CONSTRAINT "ad_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."annotations"
    ADD CONSTRAINT "annotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attributed_conversions"
    ADD CONSTRAINT "attributed_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attributed_conversions"
    ADD CONSTRAINT "attributed_conversions_site_id_conversion_event_id_key" UNIQUE ("site_id", "conversion_event_id");



ALTER TABLE ONLY "public"."campaign_costs"
    ADD CONSTRAINT "campaign_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."capi_deliveries"
    ADD CONSTRAINT "capi_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_events"
    ADD CONSTRAINT "custom_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_quality_alerts"
    ADD CONSTRAINT "data_quality_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_quality_reports"
    ADD CONSTRAINT "data_quality_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disposable_email_domains"
    ADD CONSTRAINT "disposable_email_domains_pkey" PRIMARY KEY ("domain");



ALTER TABLE ONLY "public"."gsc_connections"
    ADD CONSTRAINT "gsc_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gsc_connections"
    ADD CONSTRAINT "gsc_connections_site_key_key" UNIQUE ("site_key");



ALTER TABLE ONLY "public"."gsc_performance_daily"
    ADD CONSTRAINT "gsc_performance_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gsc_sync_runs"
    ADD CONSTRAINT "gsc_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_runs"
    ADD CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_qualifications"
    ADD CONSTRAINT "lead_qualifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_qualifications"
    ADD CONSTRAINT "lead_qualifications_site_id_visitor_id_key" UNIQUE ("site_id", "visitor_id");



ALTER TABLE "public"."lead_qualifications"
    ADD CONSTRAINT "lead_qualifications_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['unqualified'::"text", 'qualified'::"text", 'mql'::"text", 'sql'::"text"])))) NOT VALID;



ALTER TABLE ONLY "public"."managed_proxy_domains"
    ADD CONSTRAINT "managed_proxy_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."managed_proxy_domains"
    ADD CONSTRAINT "managed_proxy_domains_unique_domain" UNIQUE ("domain");



ALTER TABLE ONLY "public"."managed_proxy_domains"
    ADD CONSTRAINT "managed_proxy_domains_unique_site_key" UNIQUE ("site_key");



ALTER TABLE ONLY "public"."paas_subdomain_blocklist"
    ADD CONSTRAINT "paas_subdomain_blocklist_pkey" PRIMARY KEY ("suffix");



ALTER TABLE ONLY "public"."pageviews"
    ADD CONSTRAINT "pageviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."revenue_idempotency_keys"
    ADD CONSTRAINT "revenue_idempotency_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."revenue_idempotency_keys"
    ADD CONSTRAINT "revenue_idempotency_unique_site_provider_key" UNIQUE ("site_key", "provider", "key_type", "key_value");



ALTER TABLE ONLY "public"."revenue_ingestion_events"
    ADD CONSTRAINT "revenue_ingestion_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_alerts"
    ADD CONSTRAINT "site_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_annotations"
    ADD CONSTRAINT "site_annotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_identity_links"
    ADD CONSTRAINT "site_identity_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_usage_monthly"
    ADD CONSTRAINT "site_usage_monthly_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "sites_api_key_key" UNIQUE ("api_key");



ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "sites_public_share_token_key" UNIQUE ("public_share_token");



ALTER TABLE ONLY "public"."subscription_identity"
    ADD CONSTRAINT "subscription_identity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_revenue"
    ADD CONSTRAINT "subscription_revenue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tinybird_revenue_idempotency_keys"
    ADD CONSTRAINT "tinybird_revenue_idempotency_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gsc_performance_daily"
    ADD CONSTRAINT "unique_gsc_perf_row" UNIQUE ("site_key", "property_url", "date", "query", "page_url");



ALTER TABLE ONLY "public"."tinybird_revenue_idempotency_keys"
    ADD CONSTRAINT "unique_tinybird_site_event" UNIQUE ("site_id", "event_id");



ALTER TABLE ONLY "public"."subscription_identity"
    ADD CONSTRAINT "uq_subscription_identity_site_customer" UNIQUE ("site_id", "stripe_customer_id");



ALTER TABLE ONLY "public"."subscription_revenue"
    ADD CONSTRAINT "uq_subscription_revenue" UNIQUE ("site_id", "dedup_key");



ALTER TABLE ONLY "public"."usage_email_log"
    ADD CONSTRAINT "usage_email_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_email_log"
    ADD CONSTRAINT "usage_email_log_site_id_month_threshold_key" UNIQUE ("site_id", "month", "threshold");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_destinations"
    ADD CONSTRAINT "webhook_destinations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_destinations"
    ADD CONSTRAINT "webhook_destinations_site_key_unique" UNIQUE ("site_key");



CREATE INDEX "ad_sync_runs_site_platform_time_idx" ON "public"."ad_sync_runs" USING "btree" ("site_key", "platform", "sync_start" DESC);



CREATE UNIQUE INDEX "admin_audit_log_id_uidx" ON "public"."admin_audit_log" USING "btree" ("id");



CREATE INDEX "annotations_site_date" ON "public"."annotations" USING "btree" ("site_id", "date" DESC);



CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "public"."api_keys" USING "btree" ("key_hash");



CREATE INDEX "api_keys_owner_id_idx" ON "public"."api_keys" USING "btree" ("owner_id");



CREATE INDEX "api_keys_site_id_idx" ON "public"."api_keys" USING "btree" ("site_id");



CREATE UNIQUE INDEX "campaign_costs_site_platform_key_date_idx" ON "public"."campaign_costs" USING "btree" ("site_id", "platform", "cost_dedupe_key", "period_start");



CREATE UNIQUE INDEX "companies_id_uidx" ON "public"."companies" USING "btree" ("id");



CREATE UNIQUE INDEX "company_members_id_uidx" ON "public"."company_members" USING "btree" ("id");



CREATE INDEX "custom_events_site_id_event_type_timestamp_idx" ON "public"."custom_events" USING "btree" ("site_id", "event_type", "timestamp");



CREATE UNIQUE INDEX "dashboard_widgets_id_uidx" ON "public"."dashboard_widgets" USING "btree" ("id");



CREATE INDEX "idx_ac_channel" ON "public"."attributed_conversions" USING "btree" ("channel");



CREATE INDEX "idx_ac_site_channel" ON "public"."attributed_conversions" USING "btree" ("site_id", "first_touch_channel");



CREATE INDEX "idx_ac_site_date" ON "public"."attributed_conversions" USING "btree" ("site_id", "conversion_date" DESC);



CREATE INDEX "idx_ac_site_distinct" ON "public"."attributed_conversions" USING "btree" ("site_id", "distinct_id");



CREATE INDEX "idx_ac_site_source" ON "public"."attributed_conversions" USING "btree" ("site_id", "first_touch_source");



CREATE INDEX "idx_ac_site_status" ON "public"."attributed_conversions" USING "btree" ("site_id", "status") WHERE ("status" IS NOT NULL);



CREATE INDEX "idx_admin_audit_log_created" ON "public"."admin_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_attributed_conversions_anonymous_id" ON "public"."attributed_conversions" USING "btree" ("anonymous_id");



CREATE UNIQUE INDEX "idx_attributed_conversions_dedup" ON "public"."attributed_conversions" USING "btree" ("site_id", "external_event_id") WHERE ("external_event_id" IS NOT NULL);



CREATE INDEX "idx_attributed_conversions_distinct_id" ON "public"."attributed_conversions" USING "btree" ("distinct_id");



CREATE INDEX "idx_attributed_conversions_site_date" ON "public"."attributed_conversions" USING "btree" ("site_id", "conversion_date");



CREATE INDEX "idx_capi_deliveries_site_created" ON "public"."capi_deliveries" USING "btree" ("site_id", "created_at" DESC);



CREATE INDEX "idx_costs_site" ON "public"."campaign_costs" USING "btree" ("site_id", "period_start");



CREATE INDEX "idx_dqa_site" ON "public"."data_quality_alerts" USING "btree" ("site_id") WHERE ("is_resolved" = false);



CREATE INDEX "idx_dqr_site" ON "public"."data_quality_reports" USING "btree" ("site_id", "checked_at" DESC);



CREATE INDEX "idx_gsc_connections_site_key" ON "public"."gsc_connections" USING "btree" ("site_key");



CREATE INDEX "idx_gsc_perf_lookup" ON "public"."gsc_performance_daily" USING "btree" ("site_key", "page_path", "date");



CREATE INDEX "idx_gsc_perf_site_date" ON "public"."gsc_performance_daily" USING "btree" ("site_key", "date");



CREATE INDEX "idx_gsc_sync_runs_site_status_start" ON "public"."gsc_sync_runs" USING "btree" ("site_key", "status", "sync_start" DESC);



CREATE INDEX "idx_job_runs" ON "public"."job_runs" USING "btree" ("job_name", "ran_at" DESC);



CREATE INDEX "idx_lq_site" ON "public"."lead_qualifications" USING "btree" ("site_id", "visitor_id");



CREATE INDEX "idx_pageviews_session" ON "public"."pageviews" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "idx_pageviews_site_ts" ON "public"."pageviews" USING "btree" ("site_id", "timestamp" DESC);



CREATE INDEX "idx_pv_session" ON "public"."pageviews" USING "btree" ("session_id");



CREATE INDEX "idx_pv_site_time" ON "public"."pageviews" USING "btree" ("site_id", "timestamp" DESC);



CREATE INDEX "idx_qa_notes_feature" ON "public"."qa_notes" USING "btree" ("feature_key", "note_type");



CREATE INDEX "idx_revenue_idempotency_lookup" ON "public"."revenue_idempotency_keys" USING "btree" ("site_key", "provider", "key_type", "key_value");



CREATE INDEX "idx_revenue_idempotency_site_created" ON "public"."revenue_idempotency_keys" USING "btree" ("site_key", "created_at" DESC);



CREATE INDEX "idx_revenue_ingestion_lookup" ON "public"."revenue_ingestion_events" USING "btree" ("site_key", "provider", "created_at" DESC);



CREATE INDEX "idx_revenue_ingestion_status" ON "public"."revenue_ingestion_events" USING "btree" ("site_key", "status", "created_at" DESC);



CREATE INDEX "idx_saved_reports_user_site" ON "public"."saved_reports" USING "btree" ("user_id", "site_id");



CREATE INDEX "idx_site_identity_links_site_anon" ON "public"."site_identity_links" USING "btree" ("site_id", "anonymous_id");



CREATE INDEX "idx_site_identity_links_site_user" ON "public"."site_identity_links" USING "btree" ("site_id", "user_id");



CREATE INDEX "idx_sites_api_key_hash" ON "public"."sites" USING "btree" ("api_key_hash") WHERE ("api_key_hash" IS NOT NULL);



CREATE UNIQUE INDEX "idx_sites_custom_domain" ON "public"."sites" USING "btree" ("custom_domain") WHERE ("custom_domain" IS NOT NULL);



CREATE INDEX "idx_subscription_revenue_site_customer" ON "public"."subscription_revenue" USING "btree" ("site_id", "stripe_customer_id");



CREATE INDEX "managed_proxy_domains_domain_idx" ON "public"."managed_proxy_domains" USING "btree" ("domain");



CREATE INDEX "managed_proxy_domains_site_key_idx" ON "public"."managed_proxy_domains" USING "btree" ("site_key");



CREATE UNIQUE INDEX "qa_notes_id_uidx" ON "public"."qa_notes" USING "btree" ("id");



CREATE UNIQUE INDEX "saved_reports_id_uidx" ON "public"."saved_reports" USING "btree" ("id");



CREATE INDEX "site_annotations_site_id_date_idx" ON "public"."site_annotations" USING "btree" ("site_id", "annotation_date");



CREATE UNIQUE INDEX "site_identity_links_uniq" ON "public"."site_identity_links" USING "btree" ("site_id", "user_id", "anonymous_id");



CREATE UNIQUE INDEX "site_usage_monthly_site_month_uniq" ON "public"."site_usage_monthly" USING "btree" ("site_id", "month");



CREATE UNIQUE INDEX "sites_id_unique_idx" ON "public"."sites" USING "btree" ("id");



CREATE INDEX "sites_plan_last_seen_idx" ON "public"."sites" USING "btree" ("plan", "last_seen_at") WHERE ("plan" = 'free'::"text");



CREATE INDEX "usage_email_log_site_month_idx" ON "public"."usage_email_log" USING "btree" ("site_id", "month");



CREATE INDEX "webhook_deliveries_destination_id" ON "public"."webhook_deliveries" USING "btree" ("destination_id");



CREATE INDEX "webhook_destinations_site_key" ON "public"."webhook_destinations" USING "btree" ("site_key");



CREATE OR REPLACE TRIGGER "set_ad_platform_connections_updated_at" BEFORE UPDATE ON "public"."ad_platform_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_managed_proxy_domains_updated_at" BEFORE UPDATE ON "public"."managed_proxy_domains" FOR EACH ROW EXECUTE FUNCTION "public"."set_managed_proxy_domains_updated_at"();



CREATE OR REPLACE TRIGGER "sites_free_tier_abuse_guards" BEFORE INSERT OR UPDATE ON "public"."sites" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_free_tier_abuse_guards"();



CREATE OR REPLACE TRIGGER "update_gsc_connections_updated_at" BEFORE UPDATE ON "public"."gsc_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_gsc_performance_daily_updated_at" BEFORE UPDATE ON "public"."gsc_performance_daily" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."ad_platform_connections"
    ADD CONSTRAINT "ad_platform_connections_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ad_sync_runs"
    ADD CONSTRAINT "ad_sync_runs_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."capi_deliveries"
    ADD CONSTRAINT "capi_deliveries_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gsc_connections"
    ADD CONSTRAINT "gsc_connections_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gsc_performance_daily"
    ADD CONSTRAINT "gsc_performance_daily_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gsc_sync_runs"
    ADD CONSTRAINT "gsc_sync_runs_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."managed_proxy_domains"
    ADD CONSTRAINT "managed_proxy_domains_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."managed_proxy_domains"
    ADD CONSTRAINT "managed_proxy_domains_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."revenue_idempotency_keys"
    ADD CONSTRAINT "revenue_idempotency_keys_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."revenue_ingestion_events"
    ADD CONSTRAINT "revenue_ingestion_events_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_alerts"
    ADD CONSTRAINT "site_alerts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_annotations"
    ADD CONSTRAINT "site_annotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_annotations"
    ADD CONSTRAINT "site_annotations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_identity_links"
    ADD CONSTRAINT "site_identity_links_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."site_usage_monthly"
    ADD CONSTRAINT "site_usage_monthly_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_identity"
    ADD CONSTRAINT "subscription_identity_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_revenue"
    ADD CONSTRAINT "subscription_revenue_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "public"."webhook_destinations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_destinations"
    ADD CONSTRAINT "webhook_destinations_site_key_fkey" FOREIGN KEY ("site_key") REFERENCES "public"."sites"("site_key") ON DELETE CASCADE;



CREATE POLICY "No public access to revenue idempotency keys" ON "public"."revenue_idempotency_keys" USING (false) WITH CHECK (false);



CREATE POLICY "No public access to revenue ingestion events" ON "public"."revenue_ingestion_events" USING (false) WITH CHECK (false);



CREATE POLICY "Owner access" ON "public"."api_keys" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Owner access" ON "public"."saved_reports" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Service key access only" ON "public"."admin_audit_log" USING (false);



CREATE POLICY "Service key access only" ON "public"."qa_notes" USING (false);



CREATE POLICY "Service role manages alerts" ON "public"."site_alerts" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can manage own site annotations" ON "public"."site_annotations" USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."owner_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own site alerts" ON "public"."site_alerts" FOR SELECT USING (("site_id" IN ( SELECT "sites"."id"
   FROM "public"."sites"
  WHERE ("sites"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."ad_platform_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ad_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."annotations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attributed_conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."capi_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_widgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_quality_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_quality_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."disposable_email_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gsc_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gsc_performance_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gsc_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_qualifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."managed_proxy_domains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "managed_proxy_domains_delete_site_members" ON "public"."managed_proxy_domains" FOR DELETE USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "managed_proxy_domains_insert_site_members" ON "public"."managed_proxy_domains" FOR INSERT WITH CHECK (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "managed_proxy_domains_select_site_members" ON "public"."managed_proxy_domains" FOR SELECT USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "managed_proxy_domains_update_site_members" ON "public"."managed_proxy_domains" FOR UPDATE USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"()))))) WITH CHECK (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."paas_subdomain_blocklist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pageviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qa_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."revenue_idempotency_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."revenue_ingestion_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site members can manage annotations" ON "public"."annotations" USING (("site_id" IN ( SELECT "s"."id"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can manage connections" ON "public"."ad_platform_connections" USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"()))))) WITH CHECK (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can manage gsc connections" ON "public"."gsc_connections" USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"()))))) WITH CHECK (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can manage webhooks" ON "public"."webhook_destinations" USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"()))))) WITH CHECK (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view ad sync runs" ON "public"."ad_sync_runs" FOR SELECT USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view capi deliveries" ON "public"."capi_deliveries" FOR SELECT USING (("site_id" IN ( SELECT "s"."id"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view connections" ON "public"."ad_platform_connections" FOR SELECT USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view gsc connections" ON "public"."gsc_connections" FOR SELECT USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view gsc performance" ON "public"."gsc_performance_daily" FOR SELECT USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view gsc sync runs" ON "public"."gsc_sync_runs" FOR SELECT USING (("site_key" IN ( SELECT "s"."site_key"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view subscription identity" ON "public"."subscription_identity" FOR SELECT USING (("site_id" IN ( SELECT "s"."id"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view subscription revenue" ON "public"."subscription_revenue" FOR SELECT USING (("site_id" IN ( SELECT "s"."id"
   FROM ("public"."sites" "s"
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members can view webhook deliveries" ON "public"."webhook_deliveries" FOR SELECT USING (("destination_id" IN ( SELECT "wd"."id"
   FROM (("public"."webhook_destinations" "wd"
     JOIN "public"."sites" "s" ON (("s"."site_key" = "wd"."site_key")))
     LEFT JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE (("s"."owner_id" = "auth"."uid"()) OR ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "site members manage lead qualifications" ON "public"."lead_qualifications" USING (("site_id" IN ( SELECT "s"."id"
   FROM "public"."sites" "s"
  WHERE ("s"."owner_id" = "auth"."uid"())
UNION
 SELECT "s"."id"
   FROM ("public"."sites" "s"
     JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE ("cm"."user_id" = "auth"."uid"())))) WITH CHECK (("site_id" IN ( SELECT "s"."id"
   FROM "public"."sites" "s"
  WHERE ("s"."owner_id" = "auth"."uid"())
UNION
 SELECT "s"."id"
   FROM ("public"."sites" "s"
     JOIN "public"."company_members" "cm" ON (("cm"."company_id" = "s"."company_id")))
  WHERE ("cm"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."site_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_annotations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_identity_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_usage_monthly" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_identity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_revenue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tinybird_revenue_idempotency_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_email_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can read own memberships" ON "public"."company_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users can read own sites" ON "public"."sites" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "users can read their companies" ON "public"."companies" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "company_members"."company_id"
   FROM "public"."company_members"
  WHERE ("company_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_destinations" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "ci_readonly";











































































































































































REVOKE ALL ON FUNCTION "public"."claim_revenue_idempotency_keys"("p_site_key" "text", "p_provider" "text", "p_keys" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_revenue_idempotency_keys"("p_site_key" "text", "p_provider" "text", "p_keys" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_site_conversion_usage"("p_site_id" "uuid", "p_month" character varying, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_site_conversion_usage"("p_site_id" "uuid", "p_month" character varying, "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_site_pageview_usage"("p_site_id" "uuid", "p_month" character varying, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_site_pageview_usage"("p_site_id" "uuid", "p_month" character varying, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_monthly_pageviews"("p_site_id" "uuid", "p_month_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."count_monthly_pageviews"("p_site_id" "uuid", "p_month_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_monthly_pageviews"("p_site_id" "uuid", "p_month_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_monthly_sessions"("p_site_id" "uuid", "p_month_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."count_monthly_sessions"("p_site_id" "uuid", "p_month_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_monthly_sessions"("p_site_id" "uuid", "p_month_start" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_free_tier_abuse_guards"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_free_tier_abuse_guards"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_managed_proxy_domains_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_managed_proxy_domains_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_managed_proxy_domains_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."ad_platform_connections" TO "anon";
GRANT ALL ON TABLE "public"."ad_platform_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_platform_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."ad_platform_connections" TO "ci_readonly";



GRANT ALL ON TABLE "public"."ad_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."ad_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_sync_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."ad_sync_runs" TO "ci_readonly";



GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_audit_log" TO "ci_readonly";



GRANT ALL ON TABLE "public"."annotations" TO "anon";
GRANT ALL ON TABLE "public"."annotations" TO "authenticated";
GRANT ALL ON TABLE "public"."annotations" TO "service_role";
GRANT SELECT ON TABLE "public"."annotations" TO "ci_readonly";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";
GRANT SELECT ON TABLE "public"."api_keys" TO "ci_readonly";



GRANT ALL ON TABLE "public"."attributed_conversions" TO "anon";
GRANT ALL ON TABLE "public"."attributed_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."attributed_conversions" TO "service_role";
GRANT SELECT ON TABLE "public"."attributed_conversions" TO "ci_readonly";



GRANT ALL ON TABLE "public"."campaign_costs" TO "service_role";
GRANT SELECT ON TABLE "public"."campaign_costs" TO "ci_readonly";



GRANT ALL ON TABLE "public"."capi_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."capi_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."capi_deliveries" TO "service_role";
GRANT SELECT ON TABLE "public"."capi_deliveries" TO "ci_readonly";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";
GRANT SELECT ON TABLE "public"."companies" TO "ci_readonly";



GRANT ALL ON TABLE "public"."company_members" TO "anon";
GRANT ALL ON TABLE "public"."company_members" TO "authenticated";
GRANT ALL ON TABLE "public"."company_members" TO "service_role";
GRANT SELECT ON TABLE "public"."company_members" TO "ci_readonly";



GRANT ALL ON TABLE "public"."custom_events" TO "service_role";
GRANT SELECT ON TABLE "public"."custom_events" TO "ci_readonly";



GRANT ALL ON TABLE "public"."dashboard_widgets" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_widgets" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_widgets" TO "service_role";
GRANT SELECT ON TABLE "public"."dashboard_widgets" TO "ci_readonly";



GRANT ALL ON TABLE "public"."data_quality_alerts" TO "service_role";
GRANT SELECT ON TABLE "public"."data_quality_alerts" TO "ci_readonly";



GRANT ALL ON TABLE "public"."data_quality_reports" TO "service_role";
GRANT SELECT ON TABLE "public"."data_quality_reports" TO "ci_readonly";



GRANT ALL ON TABLE "public"."disposable_email_domains" TO "anon";
GRANT ALL ON TABLE "public"."disposable_email_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."disposable_email_domains" TO "service_role";
GRANT SELECT ON TABLE "public"."disposable_email_domains" TO "ci_readonly";



GRANT ALL ON TABLE "public"."gsc_connections" TO "anon";
GRANT ALL ON TABLE "public"."gsc_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."gsc_connections" TO "service_role";
GRANT SELECT ON TABLE "public"."gsc_connections" TO "ci_readonly";



GRANT ALL ON TABLE "public"."gsc_performance_daily" TO "anon";
GRANT ALL ON TABLE "public"."gsc_performance_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."gsc_performance_daily" TO "service_role";
GRANT SELECT ON TABLE "public"."gsc_performance_daily" TO "ci_readonly";



GRANT ALL ON TABLE "public"."gsc_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."gsc_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."gsc_sync_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."gsc_sync_runs" TO "ci_readonly";



GRANT ALL ON TABLE "public"."job_runs" TO "anon";
GRANT ALL ON TABLE "public"."job_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."job_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."job_runs" TO "ci_readonly";



GRANT ALL ON TABLE "public"."lead_qualifications" TO "service_role";
GRANT SELECT ON TABLE "public"."lead_qualifications" TO "ci_readonly";



GRANT ALL ON TABLE "public"."managed_proxy_domains" TO "anon";
GRANT ALL ON TABLE "public"."managed_proxy_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."managed_proxy_domains" TO "service_role";
GRANT SELECT ON TABLE "public"."managed_proxy_domains" TO "ci_readonly";



GRANT ALL ON TABLE "public"."paas_subdomain_blocklist" TO "anon";
GRANT ALL ON TABLE "public"."paas_subdomain_blocklist" TO "authenticated";
GRANT ALL ON TABLE "public"."paas_subdomain_blocklist" TO "service_role";
GRANT SELECT ON TABLE "public"."paas_subdomain_blocklist" TO "ci_readonly";



GRANT ALL ON TABLE "public"."pageviews" TO "service_role";
GRANT SELECT ON TABLE "public"."pageviews" TO "ci_readonly";



GRANT ALL ON TABLE "public"."qa_notes" TO "anon";
GRANT ALL ON TABLE "public"."qa_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."qa_notes" TO "service_role";
GRANT SELECT ON TABLE "public"."qa_notes" TO "ci_readonly";



GRANT ALL ON TABLE "public"."revenue_idempotency_keys" TO "anon";
GRANT ALL ON TABLE "public"."revenue_idempotency_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."revenue_idempotency_keys" TO "service_role";
GRANT SELECT ON TABLE "public"."revenue_idempotency_keys" TO "ci_readonly";



GRANT ALL ON TABLE "public"."revenue_ingestion_events" TO "anon";
GRANT ALL ON TABLE "public"."revenue_ingestion_events" TO "authenticated";
GRANT ALL ON TABLE "public"."revenue_ingestion_events" TO "service_role";
GRANT SELECT ON TABLE "public"."revenue_ingestion_events" TO "ci_readonly";



GRANT ALL ON TABLE "public"."saved_reports" TO "anon";
GRANT ALL ON TABLE "public"."saved_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_reports" TO "service_role";
GRANT SELECT ON TABLE "public"."saved_reports" TO "ci_readonly";



GRANT ALL ON TABLE "public"."site_alerts" TO "anon";
GRANT ALL ON TABLE "public"."site_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."site_alerts" TO "service_role";
GRANT SELECT ON TABLE "public"."site_alerts" TO "ci_readonly";



GRANT ALL ON TABLE "public"."site_annotations" TO "anon";
GRANT ALL ON TABLE "public"."site_annotations" TO "authenticated";
GRANT ALL ON TABLE "public"."site_annotations" TO "service_role";
GRANT SELECT ON TABLE "public"."site_annotations" TO "ci_readonly";



GRANT ALL ON TABLE "public"."site_identity_links" TO "anon";
GRANT ALL ON TABLE "public"."site_identity_links" TO "authenticated";
GRANT ALL ON TABLE "public"."site_identity_links" TO "service_role";
GRANT SELECT ON TABLE "public"."site_identity_links" TO "ci_readonly";



GRANT ALL ON TABLE "public"."site_usage_monthly" TO "anon";
GRANT ALL ON TABLE "public"."site_usage_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."site_usage_monthly" TO "service_role";
GRANT SELECT ON TABLE "public"."site_usage_monthly" TO "ci_readonly";



GRANT ALL ON TABLE "public"."sites" TO "anon";
GRANT ALL ON TABLE "public"."sites" TO "authenticated";
GRANT ALL ON TABLE "public"."sites" TO "service_role";
GRANT SELECT ON TABLE "public"."sites" TO "ci_readonly";



GRANT ALL ON TABLE "public"."subscription_identity" TO "anon";
GRANT ALL ON TABLE "public"."subscription_identity" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_identity" TO "service_role";
GRANT SELECT ON TABLE "public"."subscription_identity" TO "ci_readonly";



GRANT ALL ON TABLE "public"."subscription_revenue" TO "anon";
GRANT ALL ON TABLE "public"."subscription_revenue" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_revenue" TO "service_role";
GRANT SELECT ON TABLE "public"."subscription_revenue" TO "ci_readonly";



GRANT ALL ON TABLE "public"."tinybird_revenue_idempotency_keys" TO "anon";
GRANT ALL ON TABLE "public"."tinybird_revenue_idempotency_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."tinybird_revenue_idempotency_keys" TO "service_role";
GRANT SELECT ON TABLE "public"."tinybird_revenue_idempotency_keys" TO "ci_readonly";



GRANT ALL ON TABLE "public"."usage_email_log" TO "anon";
GRANT ALL ON TABLE "public"."usage_email_log" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_email_log" TO "service_role";
GRANT SELECT ON TABLE "public"."usage_email_log" TO "ci_readonly";



GRANT ALL ON TABLE "public"."webhook_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "service_role";
GRANT SELECT ON TABLE "public"."webhook_deliveries" TO "ci_readonly";



GRANT ALL ON TABLE "public"."webhook_destinations" TO "anon";
GRANT ALL ON TABLE "public"."webhook_destinations" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_destinations" TO "service_role";
GRANT SELECT ON TABLE "public"."webhook_destinations" TO "ci_readonly";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "ci_readonly";































