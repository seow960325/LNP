--
-- PostgreSQL database dump
--

\restrict CQ59U3gxF0OqdFFip9xnV66bibs2ZyBrZ7sSdBNcDpiPiffVh2P45gVmBtsMFbh

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: board_item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.board_item_type AS ENUM (
    'task',
    'heads_up',
    'reminder'
);


--
-- Name: board_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.board_priority AS ENUM (
    'low',
    'normal',
    'high'
);


--
-- Name: board_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.board_status AS ENUM (
    'open',
    'done'
);


--
-- Name: request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: request_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_type AS ENUM (
    'annual_leave',
    'medical_leave',
    'ot',
    'claim'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'teacher',
    'staff',
    'parent',
    'shareholder',
    'super_admin'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: board_items_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.board_items_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if is_admin_or_super() or old.author_id = auth.uid() then
    return new;
  end if;
  if new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.type is distinct from old.type
     or new.priority is distinct from old.priority
     or new.assigned_to is distinct from old.assigned_to
     or new.author_id is distinct from old.author_id
     or new.date is distinct from old.date
     or new.center_id is distinct from old.center_id then
    raise exception 'You may only mark items done; editing is restricted to author or admin';
  end if;
  return new;
end; $$;


--
-- Name: claims_approval_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claims_approval_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare actor uuid := auth.uid();
        actor_role text;
begin
  select role into actor_role from public.profiles where id = actor;

  if new.status is distinct from old.status
     and new.status in ('approved','rejected') then
    if actor_role not in ('admin','super_admin') then
      raise exception 'Only admin can approve or reject claims';
    end if;
    if actor = old.claimant_id then
      raise exception 'You cannot approve or reject your own claim';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.reject_reason),'') = '' then
      raise exception 'Reject reason required';
    end if;
    new.approved_by := actor;
    new.approved_at := now();
  end if;

  if new.status = 'pending' and old.status = 'rejected' then
    new.approved_by   := null;
    new.approved_at   := null;
    new.reject_reason := null;
    new.submitted_at  := now();
  end if;

  return new;
end $$;


--
-- Name: claims_receipt_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claims_receipt_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare actor uuid := auth.uid();
        actor_role text;
begin
  if new.receipt_held is distinct from old.receipt_held then
    select role into actor_role from public.profiles where id = actor;
    if actor_role not in ('admin','super_admin') then
      raise exception 'Only admin can mark receipt as held';
    end if;
  end if;
  return new;
end $$;


--
-- Name: claims_set_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claims_set_period() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.period := to_char(new.expense_date, 'YYYY-MM');
  return new;
end $$;


--
-- Name: current_user_center_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_center_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select center_id from public.profiles where id = auth.uid()
$$;


--
-- Name: current_user_is_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_is_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;


--
-- Name: generate_invoice_no(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_invoice_no(p_center uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v public.invoice_settings;
  v_period text;
  v_parts text[] := '{}';
  v_seq int;
begin
  select * into v from public.invoice_settings where center_id = p_center for update;
  if v.id is null then
    insert into public.invoice_settings (center_id) values (p_center)
    on conflict (center_id) do nothing;
    select * into v from public.invoice_settings where center_id = p_center for update;
  end if;

  v_period := case
    when v.include_year and v.include_month then to_char(now(),'YYYY-MM')
    when v.include_year then to_char(now(),'YYYY')
    when v.include_month then to_char(now(),'MM')
    else 'ALL' end;

  if v.seq_period is distinct from v_period then v_seq := v.start_seq;
  else v_seq := v.next_seq; end if;

  update public.invoice_settings
  set next_seq = v_seq + 1, seq_period = v_period
  where center_id = p_center;

  v_parts := array_append(v_parts, v.prefix);
  if v.include_year then v_parts := array_append(v_parts, to_char(now(),'YYYY')); end if;
  if v.include_month then v_parts := array_append(v_parts, to_char(now(),'MM')); end if;
  v_parts := array_append(v_parts, lpad(v_seq::text, v.seq_padding, '0'));

  return array_to_string(v_parts, v.separator);
end; $$;


--
-- Name: invoices_set_invoice_no(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invoices_set_invoice_no() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.invoice_no is null then
    new.invoice_no := generate_invoice_no(new.center_id);
  end if;
  return new;
end;
$$;


--
-- Name: is_admin_or_super(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_or_super() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin') and active)
$$;


--
-- Name: is_app_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_app_owner() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_app_owner = true
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active)
$$;


--
-- Name: kudos_top_recipient(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kudos_top_recipient() RETURNS TABLE(to_user_id uuid, full_name text, kudos_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select k.to_user_id, p.full_name, count(*) as kudos_count
  from public.kudos k
  join public.profiles p on p.id = k.to_user_id
  where k.center_id = current_user_center_id()
  group by k.to_user_id, p.full_name
  order by kudos_count desc, p.full_name asc
  limit 1
$$;


--
-- Name: leave_approval_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_approval_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare actor uuid := auth.uid();
        actor_role text;
begin
  select role into actor_role from public.profiles where id = actor;

  if new.status is distinct from old.status
     and new.status in ('approved','rejected') then
    if actor_role not in ('admin','super_admin') then
      raise exception 'Only admin can approve or reject leave';
    end if;
    if actor = old.profile_id then
      raise exception 'You cannot approve or reject your own leave';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.reject_reason),'') = '' then
      raise exception 'Reject reason required';
    end if;
    new.approved_by := actor;
    new.approved_at := now();
  end if;

  if new.status = 'pending' and old.status = 'rejected' then
    new.approved_by   := null;
    new.approved_at   := null;
    new.reject_reason := null;
    new.submitted_at  := now();
  end if;

  return new;
end $$;


--
-- Name: leave_set_days(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_set_days() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.segment in ('am','pm') then
    if new.start_date <> new.end_date then
      raise exception 'Half-day leave must be a single date';
    end if;
    new.days := 0.5;
  else
    new.days := (
      select count(*) from generate_series(new.start_date, new.end_date, interval '1 day') d
      where extract(isodow from d) < 6
    );
    if new.days = 0 then
      raise exception 'Leave range contains no working days (Mon-Fri)';
    end if;
  end if;
  return new;
end $$;


--
-- Name: profiles_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (new.role = 'super_admin') and not is_super_admin() then
    raise exception 'Only super_admin may assign the super_admin role';
  end if;
  if tg_op = 'UPDATE' then
    -- OWNER PROTECTION: nobody except the owner may modify the owner's row.
    if old.is_app_owner = true and not is_app_owner() then
      raise exception 'The app owner profile cannot be modified by others';
    end if;
    -- OWNER FLAG PROTECTION: is_app_owner can never be changed via app path
    -- (only settable by disabling this trigger in SQL editor).
    if new.is_app_owner is distinct from old.is_app_owner then
      raise exception 'The app owner flag cannot be changed';
    end if;

    if new.id = auth.uid() and not is_admin_or_super() then
      if new.role is distinct from old.role
         or new.center_id is distinct from old.center_id
         or new.active is distinct from old.active then
        raise exception 'You cannot change your own role, center, or active status';
      end if;
    end if;
    if not is_super_admin() and (new.center_id is distinct from old.center_id) then
      raise exception 'Only super_admin may change a profile center';
    end if;
    if not is_super_admin() and old.role = 'super_admin' then
      raise exception 'Only super_admin may modify a super_admin profile';
    end if;
  end if;
  return new;
end; $$;


--
-- Name: requests_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.requests_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if is_admin_or_super() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'Cannot create a request for another user';
    end if;
    if new.status is distinct from 'pending' then
      raise exception 'New requests must start as pending';
    end if;
    if new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'Cannot set review fields on a new request';
    end if;
    return new;
  end if;

  -- UPDATE branch
  if new.center_id is distinct from old.center_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Cannot change center_id or user_id on request';
  end if;
  if old.status is distinct from 'pending' then
    raise exception 'Cannot modify a request that has been reviewed';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Only an admin can change request status';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Cannot set review fields';
  end if;
  return new;
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at := now(); return new; end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: attendance_conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_conditions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: board_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    author_id uuid NOT NULL,
    type public.board_item_type DEFAULT 'task'::public.board_item_type NOT NULL,
    title text NOT NULL,
    body text,
    priority public.board_priority DEFAULT 'normal'::public.board_priority NOT NULL,
    status public.board_status DEFAULT 'open'::public.board_status NOT NULL,
    assigned_to uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: center_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.center_settings (
    center_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: claim_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claim_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claimant_id uuid NOT NULL,
    category_id uuid NOT NULL,
    description text NOT NULL,
    expense_date date NOT NULL,
    amount numeric(10,2) NOT NULL,
    receipt_held boolean DEFAULT false NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reject_reason text,
    approved_by uuid,
    approved_at timestamp with time zone,
    period text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT claims_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT claims_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: duty_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duty_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_date date NOT NULL,
    duty_type_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    is_manual boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: duty_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duty_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    headcount integer DEFAULT 1 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT duty_types_headcount_check CHECK ((headcount >= 1))
);


--
-- Name: fee_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    name text NOT NULL,
    default_price numeric(10,2) DEFAULT 0 NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_name text NOT NULL,
    account_no text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    description text NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: invoice_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    prefix text DEFAULT 'INV'::text NOT NULL,
    include_year boolean DEFAULT true NOT NULL,
    include_month boolean DEFAULT true NOT NULL,
    separator text DEFAULT '-'::text NOT NULL,
    seq_padding integer DEFAULT 4 NOT NULL,
    start_seq integer DEFAULT 1 NOT NULL,
    next_seq integer DEFAULT 1 NOT NULL,
    seq_period text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    student_id uuid NOT NULL,
    invoice_no text NOT NULL,
    term_label text,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    paid_at timestamp with time zone,
    payment_method text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    receipt_path text,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'void'::text])))
);


--
-- Name: kudos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kudos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    value_id uuid NOT NULL,
    message text,
    is_from_parent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kudos_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kudos_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    icon_key text,
    parent_label text,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: leave_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    year integer NOT NULL,
    leave_type text NOT NULL,
    entitled_days numeric(4,1) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leave_balances_entitled_days_check CHECK ((entitled_days >= (0)::numeric)),
    CONSTRAINT leave_balances_leave_type_check CHECK ((leave_type = ANY (ARRAY['AL'::text, 'MC'::text])))
);


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    leave_type text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    segment text DEFAULT 'full'::text NOT NULL,
    days numeric(4,1) DEFAULT 0 NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    reject_reason text,
    approved_by uuid,
    approved_at timestamp with time zone,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leave_requests_check CHECK ((end_date >= start_date)),
    CONSTRAINT leave_requests_leave_type_check CHECK ((leave_type = ANY (ARRAY['AL'::text, 'MC'::text]))),
    CONSTRAINT leave_requests_segment_check CHECK ((segment = ANY (ARRAY['full'::text, 'am'::text, 'pm'::text]))),
    CONSTRAINT leave_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: payroll_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_settings (
    center_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    epf_rate_employee numeric(5,2) DEFAULT 11.00 NOT NULL,
    epf_rate_employer numeric(5,2) DEFAULT 13.00 NOT NULL,
    epf_rate_employer_high numeric(5,2) DEFAULT 12.00 NOT NULL,
    socso_scheme text DEFAULT 'standard'::text NOT NULL,
    sender_email text DEFAULT 'learnnplay_admin@example.com'::text,
    company_name text,
    company_address text,
    company_regno text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT payroll_settings_socso_scheme_check CHECK ((socso_scheme = ANY (ARRAY['standard'::text, 'with_skbbk'::text])))
);


--
-- Name: payroll_ytd_opening; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_ytd_opening (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    year integer NOT NULL,
    opening_gross numeric(12,2) DEFAULT 0 NOT NULL,
    opening_pcb numeric(12,2) DEFAULT 0 NOT NULL,
    opening_epf_employee numeric(12,2) DEFAULT 0 NOT NULL,
    opening_socso_employee numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: payslips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payslips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    employee_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    base_salary numeric(10,2) DEFAULT 0 NOT NULL,
    allowance numeric(10,2) DEFAULT 0 NOT NULL,
    overtime numeric(10,2) DEFAULT 0 NOT NULL,
    bonus numeric(10,2) DEFAULT 0 NOT NULL,
    unpaid_leave_deduction numeric(10,2) DEFAULT 0 NOT NULL,
    epf_employee numeric(10,2) DEFAULT 0 NOT NULL,
    epf_employer numeric(10,2) DEFAULT 0 NOT NULL,
    socso_employee numeric(10,2) DEFAULT 0 NOT NULL,
    socso_employer numeric(10,2) DEFAULT 0 NOT NULL,
    eis_employee numeric(10,2) DEFAULT 0 NOT NULL,
    eis_employer numeric(10,2) DEFAULT 0 NOT NULL,
    pcb numeric(10,2) DEFAULT 0 NOT NULL,
    gross_pay numeric(10,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(10,2) DEFAULT 0 NOT NULL,
    net_pay numeric(10,2) DEFAULT 0 NOT NULL,
    ytd_gross numeric(12,2) DEFAULT 0 NOT NULL,
    ytd_pcb numeric(12,2) DEFAULT 0 NOT NULL,
    manual_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_by uuid,
    finalized_at timestamp with time zone,
    sent_at timestamp with time zone,
    CONSTRAINT payslips_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT payslips_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'finalized'::text, 'sent'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    center_id uuid NOT NULL,
    full_name text NOT NULL,
    role public.user_role DEFAULT 'staff'::public.user_role NOT NULL,
    title text,
    avatar_url text,
    phone text,
    email text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    is_paid_employee boolean DEFAULT true NOT NULL,
    is_app_owner boolean DEFAULT false NOT NULL,
    in_duty_roster boolean DEFAULT false NOT NULL
);


--
-- Name: roster_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roster_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    user_id uuid NOT NULL,
    date date NOT NULL,
    shift_start time without time zone NOT NULL,
    shift_end time without time zone NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    doc_type text NOT NULL,
    year integer NOT NULL,
    month integer,
    file_name text NOT NULL,
    storage_path text NOT NULL,
    uploaded_by uuid,
    center_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_documents_doc_type_check CHECK ((doc_type = ANY (ARRAY['ea'::text, 'payslip'::text]))),
    CONSTRAINT staff_documents_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: student_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    student_id uuid NOT NULL,
    attendance_date date DEFAULT CURRENT_DATE NOT NULL,
    arrived_at timestamp with time zone,
    arrival_temp numeric(4,1),
    arrival_photo_url text,
    arrival_condition_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    arrived_by uuid,
    departed_at timestamp with time zone,
    departure_condition_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    pickup_by_name text,
    pickup_photo_url text,
    departed_by uuid,
    care_note text,
    care_photo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    has_medicine boolean DEFAULT false NOT NULL,
    medicine_photo_url text,
    medicine_dose_amount numeric,
    medicine_dose_unit text,
    medicine_instruction text
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    name text NOT NULL,
    parent_name text,
    parent_phone text,
    parent_email text,
    package_id uuid,
    enrolled_at date,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dob date,
    address text,
    photo_url text,
    class_id uuid
);


--
-- Name: term_deletion_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.term_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    term_id uuid NOT NULL,
    scope text DEFAULT 'both'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT term_deletion_requests_scope_check CHECK ((scope = ANY (ARRAY['both'::text, 'board'::text, 'attendance'::text]))),
    CONSTRAINT term_deletion_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    center_id uuid NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tile_layouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tile_layouts (
    menu_key text NOT NULL,
    tile_order text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: attendance_conditions attendance_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_conditions
    ADD CONSTRAINT attendance_conditions_pkey PRIMARY KEY (id);


--
-- Name: board_items board_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_items
    ADD CONSTRAINT board_items_pkey PRIMARY KEY (id);


--
-- Name: center_settings center_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.center_settings
    ADD CONSTRAINT center_settings_pkey PRIMARY KEY (center_id, key);


--
-- Name: centers centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.centers
    ADD CONSTRAINT centers_pkey PRIMARY KEY (id);


--
-- Name: claim_categories claim_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_categories
    ADD CONSTRAINT claim_categories_name_key UNIQUE (name);


--
-- Name: claim_categories claim_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claim_categories
    ADD CONSTRAINT claim_categories_pkey PRIMARY KEY (id);


--
-- Name: claims claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: duty_assignments duty_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_assignments
    ADD CONSTRAINT duty_assignments_pkey PRIMARY KEY (id);


--
-- Name: duty_assignments duty_assignments_work_date_duty_type_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_assignments
    ADD CONSTRAINT duty_assignments_work_date_duty_type_id_profile_id_key UNIQUE (work_date, duty_type_id, profile_id);


--
-- Name: duty_types duty_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_types
    ADD CONSTRAINT duty_types_name_key UNIQUE (name);


--
-- Name: duty_types duty_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_types
    ADD CONSTRAINT duty_types_pkey PRIMARY KEY (id);


--
-- Name: fee_packages fee_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_packages
    ADD CONSTRAINT fee_packages_pkey PRIMARY KEY (id);


--
-- Name: invoice_bank_accounts invoice_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_bank_accounts
    ADD CONSTRAINT invoice_bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_settings invoice_settings_center_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_settings
    ADD CONSTRAINT invoice_settings_center_id_key UNIQUE (center_id);


--
-- Name: invoice_settings invoice_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_settings
    ADD CONSTRAINT invoice_settings_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_no_key UNIQUE (invoice_no);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: kudos kudos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos
    ADD CONSTRAINT kudos_pkey PRIMARY KEY (id);


--
-- Name: kudos_values kudos_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos_values
    ADD CONSTRAINT kudos_values_pkey PRIMARY KEY (id);


--
-- Name: leave_balances leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);


--
-- Name: leave_balances leave_balances_profile_id_year_leave_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_profile_id_year_leave_type_key UNIQUE (profile_id, year, leave_type);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: payroll_settings payroll_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_settings
    ADD CONSTRAINT payroll_settings_pkey PRIMARY KEY (center_id);


--
-- Name: payroll_ytd_opening payroll_ytd_opening_employee_id_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ytd_opening
    ADD CONSTRAINT payroll_ytd_opening_employee_id_year_key UNIQUE (employee_id, year);


--
-- Name: payroll_ytd_opening payroll_ytd_opening_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ytd_opening
    ADD CONSTRAINT payroll_ytd_opening_pkey PRIMARY KEY (id);


--
-- Name: payslips payslips_employee_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employee_id_year_month_key UNIQUE (employee_id, year, month);


--
-- Name: payslips payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: roster_shifts roster_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_shifts
    ADD CONSTRAINT roster_shifts_pkey PRIMARY KEY (id);


--
-- Name: staff_documents staff_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_pkey PRIMARY KEY (id);


--
-- Name: staff_documents staff_documents_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_storage_path_key UNIQUE (storage_path);


--
-- Name: student_attendance student_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_attendance
    ADD CONSTRAINT student_attendance_pkey PRIMARY KEY (id);


--
-- Name: student_attendance student_attendance_student_id_attendance_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_attendance
    ADD CONSTRAINT student_attendance_student_id_attendance_date_key UNIQUE (student_id, attendance_date);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: term_deletion_requests term_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_deletion_requests
    ADD CONSTRAINT term_deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: terms terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terms
    ADD CONSTRAINT terms_pkey PRIMARY KEY (id);


--
-- Name: tile_layouts tile_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tile_layouts
    ADD CONSTRAINT tile_layouts_pkey PRIMARY KEY (menu_key);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: idx_users_created_at_desc; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_email ON auth.users USING btree (email);


--
-- Name: idx_users_last_sign_in_at_desc; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);


--
-- Name: idx_users_name; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: claims_claimant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX claims_claimant_idx ON public.claims USING btree (claimant_id);


--
-- Name: claims_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX claims_period_idx ON public.claims USING btree (period);


--
-- Name: claims_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX claims_status_idx ON public.claims USING btree (status);


--
-- Name: duty_assignments_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX duty_assignments_date_idx ON public.duty_assignments USING btree (work_date);


--
-- Name: idx_board_center_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_board_center_date ON public.board_items USING btree (center_id, date DESC);


--
-- Name: idx_board_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_board_status ON public.board_items USING btree (status);


--
-- Name: idx_center_settings_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_center_settings_center ON public.center_settings USING btree (center_id);


--
-- Name: idx_fee_packages_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_packages_active ON public.fee_packages USING btree (center_id, active);


--
-- Name: idx_fee_packages_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_packages_center ON public.fee_packages USING btree (center_id);


--
-- Name: idx_invoice_line_items_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_line_items_invoice ON public.invoice_line_items USING btree (invoice_id);


--
-- Name: idx_invoices_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_center ON public.invoices USING btree (center_id);


--
-- Name: idx_invoices_invoice_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_invoice_no ON public.invoices USING btree (invoice_no);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (center_id, status);


--
-- Name: idx_invoices_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_student ON public.invoices USING btree (student_id);


--
-- Name: idx_kudos_center_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kudos_center_created ON public.kudos USING btree (center_id, created_at DESC);


--
-- Name: idx_kudos_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kudos_to ON public.kudos USING btree (to_user_id);


--
-- Name: idx_profiles_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_center ON public.profiles USING btree (center_id);


--
-- Name: idx_roster_shifts_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roster_shifts_center ON public.roster_shifts USING btree (center_id);


--
-- Name: idx_roster_shifts_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roster_shifts_user_date ON public.roster_shifts USING btree (user_id, date);


--
-- Name: idx_students_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_active ON public.students USING btree (center_id, active);


--
-- Name: idx_students_center; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_center ON public.students USING btree (center_id);


--
-- Name: idx_students_package; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_package ON public.students USING btree (package_id);


--
-- Name: leave_req_profile_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_req_profile_idx ON public.leave_requests USING btree (profile_id);


--
-- Name: leave_req_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_req_status_idx ON public.leave_requests USING btree (status);


--
-- Name: leave_req_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_req_type_idx ON public.leave_requests USING btree (leave_type);


--
-- Name: payslips_center_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslips_center_period_idx ON public.payslips USING btree (center_id, year, month);


--
-- Name: payslips_emp_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslips_emp_period_idx ON public.payslips USING btree (employee_id, year, month);


--
-- Name: staff_documents_center_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_documents_center_idx ON public.staff_documents USING btree (center_id);


--
-- Name: staff_documents_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_documents_owner_idx ON public.staff_documents USING btree (owner_id);


--
-- Name: board_items board_items_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER board_items_guard_trg BEFORE UPDATE ON public.board_items FOR EACH ROW EXECUTE FUNCTION public.board_items_guard();


--
-- Name: claims claims_approval_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER claims_approval_guard_trg BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.claims_approval_guard();


--
-- Name: claims claims_receipt_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER claims_receipt_guard_trg BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.claims_receipt_guard();


--
-- Name: claims claims_set_period_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER claims_set_period_trg BEFORE INSERT OR UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.claims_set_period();


--
-- Name: claims claims_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER claims_touch BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: invoices invoices_set_invoice_no_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoices_set_invoice_no_trg BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoices_set_invoice_no();


--
-- Name: leave_requests leave_approval_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leave_approval_guard_trg BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.leave_approval_guard();


--
-- Name: leave_balances leave_bal_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leave_bal_touch BEFORE UPDATE ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: leave_requests leave_req_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leave_req_touch BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: leave_requests leave_set_days_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leave_set_days_trg BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.leave_set_days();


--
-- Name: profiles profiles_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_guard_trg BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: board_items board_items_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_items
    ADD CONSTRAINT board_items_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: board_items board_items_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_items
    ADD CONSTRAINT board_items_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: board_items board_items_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_items
    ADD CONSTRAINT board_items_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: center_settings center_settings_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.center_settings
    ADD CONSTRAINT center_settings_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: center_settings center_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.center_settings
    ADD CONSTRAINT center_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claims claims_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: claims claims_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.claim_categories(id) ON DELETE RESTRICT;


--
-- Name: claims claims_claimant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_claimant_id_fkey FOREIGN KEY (claimant_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: duty_assignments duty_assignments_duty_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_assignments
    ADD CONSTRAINT duty_assignments_duty_type_id_fkey FOREIGN KEY (duty_type_id) REFERENCES public.duty_types(id) ON DELETE CASCADE;


--
-- Name: duty_assignments duty_assignments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_assignments
    ADD CONSTRAINT duty_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: kudos kudos_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos
    ADD CONSTRAINT kudos_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: kudos kudos_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos
    ADD CONSTRAINT kudos_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: kudos kudos_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos
    ADD CONSTRAINT kudos_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: kudos kudos_value_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos
    ADD CONSTRAINT kudos_value_id_fkey FOREIGN KEY (value_id) REFERENCES public.kudos_values(id);


--
-- Name: kudos_values kudos_values_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos_values
    ADD CONSTRAINT kudos_values_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: leave_balances leave_balances_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: payroll_settings payroll_settings_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_settings
    ADD CONSTRAINT payroll_settings_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id);


--
-- Name: payroll_settings payroll_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_settings
    ADD CONSTRAINT payroll_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: payroll_ytd_opening payroll_ytd_opening_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ytd_opening
    ADD CONSTRAINT payroll_ytd_opening_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id);


--
-- Name: payroll_ytd_opening payroll_ytd_opening_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ytd_opening
    ADD CONSTRAINT payroll_ytd_opening_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id);


--
-- Name: payroll_ytd_opening payroll_ytd_opening_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_ytd_opening
    ADD CONSTRAINT payroll_ytd_opening_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: payslips payslips_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id);


--
-- Name: payslips payslips_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: payslips payslips_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: payslips payslips_finalized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: roster_shifts roster_shifts_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_shifts
    ADD CONSTRAINT roster_shifts_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE CASCADE;


--
-- Name: roster_shifts roster_shifts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roster_shifts
    ADD CONSTRAINT roster_shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: staff_documents staff_documents_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.centers(id);


--
-- Name: staff_documents staff_documents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: staff_documents staff_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_documents
    ADD CONSTRAINT staff_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: student_attendance student_attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_attendance
    ADD CONSTRAINT student_attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: students students_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.fee_packages(id) ON DELETE SET NULL;


--
-- Name: term_deletion_requests term_deletion_requests_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term_deletion_requests
    ADD CONSTRAINT term_deletion_requests_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id) ON DELETE CASCADE;


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: student_attendance attendance_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_admin_delete ON public.student_attendance FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: attendance_conditions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_conditions ENABLE ROW LEVEL SECURITY;

--
-- Name: student_attendance attendance_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_delete ON public.student_attendance FOR DELETE USING ((public.current_user_is_active() AND public.is_admin_or_super()));


--
-- Name: student_attendance attendance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_insert ON public.student_attendance FOR INSERT WITH CHECK ((public.current_user_is_active() AND (center_id = public.current_user_center_id())));


--
-- Name: student_attendance attendance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_read ON public.student_attendance FOR SELECT USING ((public.current_user_is_active() AND (center_id = public.current_user_center_id())));


--
-- Name: student_attendance attendance_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_update ON public.student_attendance FOR UPDATE USING ((public.current_user_is_active() AND (center_id = public.current_user_center_id()))) WITH CHECK ((public.current_user_is_active() AND (center_id = public.current_user_center_id())));


--
-- Name: invoice_bank_accounts bank_accounts_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bank_accounts_admin_all ON public.invoice_bank_accounts USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: board_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_items ENABLE ROW LEVEL SECURITY;

--
-- Name: board_items board_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_items_delete ON public.board_items FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())) OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()) AND (author_id = auth.uid()))));


--
-- Name: board_items board_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_items_insert ON public.board_items FOR INSERT TO authenticated WITH CHECK ((public.current_user_is_active() AND (center_id = public.current_user_center_id()) AND (author_id = auth.uid())));


--
-- Name: board_items board_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_items_select ON public.board_items FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()))));


--
-- Name: board_items board_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_items_update ON public.board_items FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.current_user_is_active() AND (center_id = public.current_user_center_id())))) WITH CHECK ((public.is_super_admin() OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()))));


--
-- Name: center_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.center_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: center_settings center_settings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY center_settings_delete ON public.center_settings FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: center_settings center_settings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY center_settings_insert ON public.center_settings FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: center_settings center_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY center_settings_select ON public.center_settings FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()))));


--
-- Name: center_settings center_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY center_settings_update ON public.center_settings FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: centers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;

--
-- Name: centers centers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY centers_delete ON public.centers FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: centers centers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY centers_insert ON public.centers FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());


--
-- Name: centers centers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY centers_select ON public.centers FOR SELECT TO authenticated USING ((public.is_super_admin() OR (id = public.current_user_center_id())));


--
-- Name: centers centers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY centers_update ON public.centers FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (id = public.current_user_center_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (id = public.current_user_center_id()))));


--
-- Name: claim_categories claim_cat_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claim_cat_admin ON public.claim_categories TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: claim_categories claim_cat_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claim_cat_read ON public.claim_categories FOR SELECT TO authenticated USING (true);


--
-- Name: claim_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claim_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

--
-- Name: claims claims_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claims_delete_admin ON public.claims FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: claims claims_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claims_delete_own ON public.claims FOR DELETE TO authenticated USING (((claimant_id = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: claims claims_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claims_insert ON public.claims FOR INSERT TO authenticated WITH CHECK (((claimant_id = auth.uid()) AND (status = 'pending'::text) AND (approved_by IS NULL) AND (receipt_held = false)));


--
-- Name: claims claims_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claims_select ON public.claims FOR SELECT TO authenticated USING (((claimant_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))));


--
-- Name: claims claims_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claims_update_admin ON public.claims FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: claims claims_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY claims_update_own ON public.claims FOR UPDATE TO authenticated USING (((claimant_id = auth.uid()) AND (status = ANY (ARRAY['pending'::text, 'rejected'::text])))) WITH CHECK ((claimant_id = auth.uid()));


--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: classes classes_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_admin_write ON public.classes USING ((public.current_user_is_active() AND public.is_admin_or_super())) WITH CHECK ((public.current_user_is_active() AND public.is_admin_or_super()));


--
-- Name: classes classes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_read ON public.classes FOR SELECT USING (public.current_user_is_active());


--
-- Name: attendance_conditions conditions_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conditions_admin_write ON public.attendance_conditions USING ((public.current_user_is_active() AND public.is_admin_or_super())) WITH CHECK ((public.current_user_is_active() AND public.is_admin_or_super()));


--
-- Name: attendance_conditions conditions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conditions_read ON public.attendance_conditions FOR SELECT USING (public.current_user_is_active());


--
-- Name: duty_assignments duty_assign_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY duty_assign_admin ON public.duty_assignments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: duty_assignments duty_assign_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY duty_assign_read ON public.duty_assignments FOR SELECT TO authenticated USING (true);


--
-- Name: duty_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.duty_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: duty_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.duty_types ENABLE ROW LEVEL SECURITY;

--
-- Name: duty_types duty_types_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY duty_types_admin ON public.duty_types TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: duty_types duty_types_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY duty_types_read ON public.duty_types FOR SELECT TO authenticated USING (true);


--
-- Name: fee_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fee_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_packages fee_packages_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_packages_delete ON public.fee_packages FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: fee_packages fee_packages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_packages_insert ON public.fee_packages FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: fee_packages fee_packages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_packages_select ON public.fee_packages FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: fee_packages fee_packages_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_packages_update ON public.fee_packages FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: invoice_bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items invoice_line_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_line_items_delete ON public.invoice_line_items FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (EXISTS ( SELECT 1
   FROM public.invoices
  WHERE ((invoices.id = invoice_line_items.invoice_id) AND (invoices.center_id = public.current_user_center_id())))))));


--
-- Name: invoice_line_items invoice_line_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_line_items_insert ON public.invoice_line_items FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (EXISTS ( SELECT 1
   FROM public.invoices
  WHERE ((invoices.id = invoice_line_items.invoice_id) AND (invoices.center_id = public.current_user_center_id())))))));


--
-- Name: invoice_line_items invoice_line_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_line_items_select ON public.invoice_line_items FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (EXISTS ( SELECT 1
   FROM public.invoices
  WHERE ((invoices.id = invoice_line_items.invoice_id) AND (invoices.center_id = public.current_user_center_id())))))));


--
-- Name: invoice_line_items invoice_line_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_line_items_update ON public.invoice_line_items FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (EXISTS ( SELECT 1
   FROM public.invoices
  WHERE ((invoices.id = invoice_line_items.invoice_id) AND (invoices.center_id = public.current_user_center_id()))))))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (EXISTS ( SELECT 1
   FROM public.invoices
  WHERE ((invoices.id = invoice_line_items.invoice_id) AND (invoices.center_id = public.current_user_center_id())))))));


--
-- Name: invoice_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_settings invoice_settings_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_settings_admin_read ON public.invoice_settings FOR SELECT USING (((center_id = ( SELECT profiles.center_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))));


--
-- Name: invoice_settings invoice_settings_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_settings_admin_write ON public.invoice_settings FOR UPDATE USING (((center_id = ( SELECT profiles.center_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))) WITH CHECK (((center_id = ( SELECT profiles.center_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_delete ON public.invoices FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: invoices invoices_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: invoices invoices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: invoices invoices_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: kudos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kudos ENABLE ROW LEVEL SECURITY;

--
-- Name: kudos kudos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kudos_delete ON public.kudos FOR DELETE TO authenticated USING ((public.is_super_admin() OR (from_user_id = auth.uid())));


--
-- Name: kudos kudos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kudos_insert ON public.kudos FOR INSERT TO authenticated WITH CHECK (((from_user_id = auth.uid()) AND (center_id = public.current_user_center_id()) AND public.current_user_is_active()));


--
-- Name: kudos kudos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kudos_select ON public.kudos FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())) OR (from_user_id = auth.uid()) OR (to_user_id = auth.uid())));


--
-- Name: kudos_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kudos_values ENABLE ROW LEVEL SECURITY;

--
-- Name: kudos_values kudos_values_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kudos_values_select ON public.kudos_values FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()))));


--
-- Name: kudos_values kudos_values_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kudos_values_write ON public.kudos_values TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: leave_balances leave_bal_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leave_bal_admin ON public.leave_balances TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: leave_balances leave_bal_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leave_bal_read ON public.leave_balances FOR SELECT TO authenticated USING ((((profile_id = auth.uid()) AND (leave_type = 'AL'::text)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))));


--
-- Name: leave_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_requests leave_req_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leave_req_delete_admin ON public.leave_requests FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: leave_requests leave_req_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leave_req_delete_own ON public.leave_requests FOR DELETE TO authenticated USING (((profile_id = auth.uid()) AND (status = 'pending'::text)));


--
-- Name: leave_requests leave_req_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leave_req_insert ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (((profile_id = auth.uid()) AND (status = 'pending'::text) AND (approved_by IS NULL)));


--
-- Name: leave_requests leave_req_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leave_req_select ON public.leave_requests FOR SELECT TO authenticated USING (((profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))));


--
-- Name: leave_requests leave_req_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leave_req_update_admin ON public.leave_requests FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: leave_requests leave_req_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leave_req_update_own ON public.leave_requests FOR UPDATE TO authenticated USING (((profile_id = auth.uid()) AND (status = ANY (ARRAY['pending'::text, 'rejected'::text])))) WITH CHECK ((profile_id = auth.uid()));


--
-- Name: leave_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_settings payroll_settings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_settings_insert ON public.payroll_settings FOR INSERT WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: payroll_settings payroll_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_settings_select ON public.payroll_settings FOR SELECT USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: payroll_settings payroll_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payroll_settings_update ON public.payroll_settings FOR UPDATE USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: payroll_ytd_opening; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_ytd_opening ENABLE ROW LEVEL SECURITY;

--
-- Name: payslips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

--
-- Name: payslips payslips_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslips_delete ON public.payslips FOR DELETE USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()) AND (status = 'draft'::text))));


--
-- Name: payslips payslips_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslips_insert ON public.payslips FOR INSERT WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: payslips payslips_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslips_select ON public.payslips FOR SELECT USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())) OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()) AND (employee_id = auth.uid()) AND (status = ANY (ARRAY['finalized'::text, 'sent'::text])))));


--
-- Name: payslips payslips_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payslips_update ON public.payslips FOR UPDATE USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()) AND (role <> ALL (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))));


--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.is_super_admin() OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()))));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING ((public.is_app_owner() OR ((( SELECT p.is_app_owner
   FROM public.profiles p
  WHERE (p.id = profiles.id)) = false) AND (public.is_super_admin() OR (id = auth.uid()) OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()) AND (role <> 'super_admin'::public.user_role)))))) WITH CHECK ((public.is_app_owner() OR ((( SELECT p.is_app_owner
   FROM public.profiles p
  WHERE (p.id = profiles.id)) = false) AND (public.is_super_admin() OR (id = auth.uid()) OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()) AND (role <> 'super_admin'::public.user_role))))));


--
-- Name: roster_shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roster_shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: roster_shifts roster_shifts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roster_shifts_delete ON public.roster_shifts FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: roster_shifts roster_shifts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roster_shifts_insert ON public.roster_shifts FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: roster_shifts roster_shifts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roster_shifts_select ON public.roster_shifts FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()))));


--
-- Name: roster_shifts roster_shifts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roster_shifts_update ON public.roster_shifts FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: staff_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_documents staff_documents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_documents_delete ON public.staff_documents FOR DELETE USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: staff_documents staff_documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_documents_insert ON public.staff_documents FOR INSERT WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: staff_documents staff_documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_documents_select ON public.staff_documents FOR SELECT USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())) OR (public.current_user_is_active() AND (center_id = public.current_user_center_id()) AND (owner_id = auth.uid()))));


--
-- Name: student_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_delete ON public.students FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: students students_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_insert ON public.students FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: students students_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select ON public.students FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: students students_teacher_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_teacher_read ON public.students FOR SELECT USING ((public.current_user_is_active() AND (center_id = public.current_user_center_id())));


--
-- Name: students students_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_update ON public.students FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super() AND (center_id = public.current_user_center_id()))));


--
-- Name: term_deletion_requests tdr_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tdr_insert_admin ON public.term_deletion_requests FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))) AND (requested_by = auth.uid())));


--
-- Name: term_deletion_requests tdr_read_center; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tdr_read_center ON public.term_deletion_requests FOR SELECT USING ((center_id = ( SELECT profiles.center_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: term_deletion_requests tdr_update_approver; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tdr_update_approver ON public.term_deletion_requests FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))) AND (requested_by <> auth.uid()))) WITH CHECK ((reviewed_by = auth.uid()));


--
-- Name: term_deletion_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.term_deletion_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;

--
-- Name: terms terms_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY terms_admin_write ON public.terms USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))))));


--
-- Name: terms terms_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY terms_read_all ON public.terms FOR SELECT USING ((center_id = ( SELECT profiles.center_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: tile_layouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tile_layouts ENABLE ROW LEVEL SECURITY;

--
-- Name: tile_layouts tile_layouts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tile_layouts_read ON public.tile_layouts FOR SELECT USING (public.current_user_is_active());


--
-- Name: tile_layouts tile_layouts_sa_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tile_layouts_sa_write ON public.tile_layouts USING ((public.current_user_is_active() AND public.is_super_admin())) WITH CHECK ((public.current_user_is_active() AND public.is_super_admin()));


--
-- Name: payroll_ytd_opening ytd_opening_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ytd_opening_admin_all ON public.payroll_ytd_opening USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])) AND (p.center_id = payroll_ytd_opening.center_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])) AND (p.center_id = payroll_ytd_opening.center_id)))));


--
-- Name: payroll_ytd_opening ytd_opening_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ytd_opening_self_read ON public.payroll_ytd_opening FOR SELECT USING ((employee_id = auth.uid()));


--
-- PostgreSQL database dump complete
--

\unrestrict CQ59U3gxF0OqdFFip9xnV66bibs2ZyBrZ7sSdBNcDpiPiffVh2P45gVmBtsMFbh

