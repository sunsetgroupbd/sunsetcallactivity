--
-- PostgreSQL database dump
--

\restrict pimgzwdIcqzcMg7w23Cj8xANT8DU0UqL8nGFJLkDDt6aWRhApqwB6f2N22GN1Sl

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

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

--
-- Name: noticepriority; Type: TYPE; Schema: public; Owner: sunset_user
--

CREATE TYPE public.noticepriority AS ENUM (
    'NORMAL',
    'IMPORTANT',
    'URGENT'
);


ALTER TYPE public.noticepriority OWNER TO sunset_user;

--
-- Name: noticestatus; Type: TYPE; Schema: public; Owner: sunset_user
--

CREATE TYPE public.noticestatus AS ENUM (
    'PUBLISHED',
    'PENDING_APPROVAL',
    'REJECTED'
);


ALTER TYPE public.noticestatus OWNER TO sunset_user;

--
-- Name: noticetype; Type: TYPE; Schema: public; Owner: sunset_user
--

CREATE TYPE public.noticetype AS ENUM (
    'TEXT',
    'PDF'
);


ALTER TYPE public.noticetype OWNER TO sunset_user;

--
-- Name: reportstatus; Type: TYPE; Schema: public; Owner: sunset_user
--

CREATE TYPE public.reportstatus AS ENUM (
    'DRAFT',
    'SUBMITTED'
);


ALTER TYPE public.reportstatus OWNER TO sunset_user;

--
-- Name: userrole; Type: TYPE; Schema: public; Owner: sunset_user
--

CREATE TYPE public.userrole AS ENUM (
    'ADMIN',
    'SUB_ADMIN',
    'TL',
    'CO',
    'EMPLOYEE',
    'tl',
    'co',
    'admin',
    'sub_admin',
    'employee'
);


ALTER TYPE public.userrole OWNER TO sunset_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO sunset_user;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.app_settings (
    id integer NOT NULL,
    namespace character varying(100) NOT NULL,
    key character varying(200) NOT NULL,
    value text NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.app_settings OWNER TO sunset_user;

--
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.app_settings_id_seq OWNER TO sunset_user;

--
-- Name: app_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;


--
-- Name: call_activity_entries; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.call_activity_entries (
    id integer NOT NULL,
    report_id integer NOT NULL,
    lead_category character varying(100) NOT NULL,
    till_today_status integer,
    slot_10am_1pm integer,
    slot_2pm_5pm integer,
    slot_5pm_6pm integer,
    total_dialed integer,
    total_connected integer,
    total_duration_minutes integer,
    lead_status_hp integer,
    lead_status_p integer,
    lead_status_fub integer,
    lead_status_ni integer,
    notes text
);


ALTER TABLE public.call_activity_entries OWNER TO sunset_user;

--
-- Name: call_activity_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.call_activity_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.call_activity_entries_id_seq OWNER TO sunset_user;

--
-- Name: call_activity_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.call_activity_entries_id_seq OWNED BY public.call_activity_entries.id;


--
-- Name: daily_activity_reports; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.daily_activity_reports (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    report_date date NOT NULL,
    notes text,
    status public.reportstatus NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone
);


ALTER TABLE public.daily_activity_reports OWNER TO sunset_user;

--
-- Name: daily_activity_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.daily_activity_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_activity_reports_id_seq OWNER TO sunset_user;

--
-- Name: daily_activity_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.daily_activity_reports_id_seq OWNED BY public.daily_activity_reports.id;


--
-- Name: daily_targets; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.daily_targets (
    id integer NOT NULL,
    employee_id integer,
    effective_from date NOT NULL,
    sales_target numeric(15,2),
    tb_target numeric(15,2),
    emi_target numeric(15,2),
    outdoor_visit_target integer,
    dialed_calls_target integer,
    connected_calls_target integer,
    meeting_hours_target numeric(6,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.daily_targets OWNER TO sunset_user;

--
-- Name: daily_targets_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.daily_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_targets_id_seq OWNER TO sunset_user;

--
-- Name: daily_targets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.daily_targets_id_seq OWNED BY public.daily_targets.id;


--
-- Name: meeting_activity_entries; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.meeting_activity_entries (
    id integer NOT NULL,
    report_id integer NOT NULL,
    activity_type character varying(100) NOT NULL,
    till_today_value integer,
    slot_10am_1pm integer,
    slot_2pm_5pm integer,
    slot_5pm_6pm integer,
    total_count integer,
    total_duration_minutes integer,
    notes text
);


ALTER TABLE public.meeting_activity_entries OWNER TO sunset_user;

--
-- Name: meeting_activity_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.meeting_activity_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.meeting_activity_entries_id_seq OWNER TO sunset_user;

--
-- Name: meeting_activity_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.meeting_activity_entries_id_seq OWNED BY public.meeting_activity_entries.id;


--
-- Name: milestone_checkpoints; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.milestone_checkpoints (
    id integer NOT NULL,
    month character varying(7) NOT NULL,
    employee_id integer,
    checkpoint_day integer NOT NULL,
    label character varying(50) NOT NULL,
    new_sales numeric(15,2) DEFAULT 0.0 NOT NULL,
    emi numeric(15,2) DEFAULT 0.0 NOT NULL,
    total_collection numeric(15,2) DEFAULT 0.0 NOT NULL,
    total_lead integer DEFAULT 0 NOT NULL,
    fair_lead integer DEFAULT 0 NOT NULL,
    fb_lead integer DEFAULT 0 NOT NULL,
    hp integer DEFAULT 0 NOT NULL,
    p integer DEFAULT 0 NOT NULL,
    fup integer DEFAULT 0 NOT NULL,
    outdoor_visits integer DEFAULT 0 NOT NULL,
    indoor_cx integer DEFAULT 0 NOT NULL,
    admin_notes text,
    updated_by_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    total_calls integer DEFAULT 0 NOT NULL,
    sold_fair numeric(15,2) DEFAULT 0.0 NOT NULL,
    sold_fb numeric(15,2) DEFAULT 0.0 NOT NULL,
    sold_other numeric(15,2) DEFAULT 0.0 NOT NULL,
    gl character varying(100),
    hold numeric(15,2) DEFAULT 0.0 NOT NULL,
    cancel numeric(15,2) DEFAULT 0.0 NOT NULL
);


ALTER TABLE public.milestone_checkpoints OWNER TO sunset_user;

--
-- Name: milestone_checkpoints_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.milestone_checkpoints_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.milestone_checkpoints_id_seq OWNER TO sunset_user;

--
-- Name: milestone_checkpoints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.milestone_checkpoints_id_seq OWNED BY public.milestone_checkpoints.id;


--
-- Name: notices; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.notices (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    notice_type public.noticetype NOT NULL,
    content text,
    file_url character varying(500),
    file_name character varying(255),
    status public.noticestatus NOT NULL,
    priority public.noticepriority NOT NULL,
    created_by_id integer,
    approved_by_id integer,
    approval_note text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notices OWNER TO sunset_user;

--
-- Name: notices_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.notices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notices_id_seq OWNER TO sunset_user;

--
-- Name: notices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.notices_id_seq OWNED BY public.notices.id;


--
-- Name: sales_collection_entries; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.sales_collection_entries (
    id integer NOT NULL,
    report_id integer NOT NULL,
    category character varying(100) NOT NULL,
    description character varying(300),
    amount numeric(15,2) NOT NULL,
    payment_sequence integer,
    customer_name character varying(500),
    customer_phone character varying(50),
    payment_method character varying(50),
    reference character varying(200),
    notes text,
    expected_payment_date date,
    reschedule_count integer NOT NULL,
    reschedule_history json,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    commitment_percentage integer
);


ALTER TABLE public.sales_collection_entries OWNER TO sunset_user;

--
-- Name: sales_collection_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.sales_collection_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sales_collection_entries_id_seq OWNER TO sunset_user;

--
-- Name: sales_collection_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.sales_collection_entries_id_seq OWNED BY public.sales_collection_entries.id;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.teams (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    director_name character varying(150),
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.teams OWNER TO sunset_user;

--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teams_id_seq OWNER TO sunset_user;

--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: sunset_user
--

CREATE TABLE public.users (
    id integer NOT NULL,
    full_name character varying(200) NOT NULL,
    email character varying(254) NOT NULL,
    phone character varying(50),
    username character varying(100) NOT NULL,
    password_hash character varying(200) NOT NULL,
    role public.userrole NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    designation character varying(150),
    team_id integer,
    reporting_manager_id integer,
    client_count integer DEFAULT 0 NOT NULL,
    client_share_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.users OWNER TO sunset_user;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: sunset_user
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO sunset_user;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sunset_user
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: app_settings id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);


--
-- Name: call_activity_entries id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.call_activity_entries ALTER COLUMN id SET DEFAULT nextval('public.call_activity_entries_id_seq'::regclass);


--
-- Name: daily_activity_reports id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.daily_activity_reports ALTER COLUMN id SET DEFAULT nextval('public.daily_activity_reports_id_seq'::regclass);


--
-- Name: daily_targets id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.daily_targets ALTER COLUMN id SET DEFAULT nextval('public.daily_targets_id_seq'::regclass);


--
-- Name: meeting_activity_entries id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.meeting_activity_entries ALTER COLUMN id SET DEFAULT nextval('public.meeting_activity_entries_id_seq'::regclass);


--
-- Name: milestone_checkpoints id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.milestone_checkpoints ALTER COLUMN id SET DEFAULT nextval('public.milestone_checkpoints_id_seq'::regclass);


--
-- Name: notices id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.notices ALTER COLUMN id SET DEFAULT nextval('public.notices_id_seq'::regclass);


--
-- Name: sales_collection_entries id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.sales_collection_entries ALTER COLUMN id SET DEFAULT nextval('public.sales_collection_entries_id_seq'::regclass);


--
-- Name: teams id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.alembic_version (version_num) FROM stdin;
\.


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.app_settings (id, namespace, key, value, description, updated_at) FROM stdin;
1	kpi_rules	indoor_cx_call_credit	35	Calls deducted from target per day with indoor CX meeting (Once-Per-Day)	2026-10-31 11:41:08.90077+00
2	kpi_rules	outdoor_visit_call_credit	70	Calls deducted from target per day with outdoor visit (Once-Per-Day)	2026-10-31 11:41:08.90077+00
\.


--
-- Data for Name: call_activity_entries; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.call_activity_entries (id, report_id, lead_category, till_today_status, slot_10am_1pm, slot_2pm_5pm, slot_5pm_6pm, total_dialed, total_connected, total_duration_minutes, lead_status_hp, lead_status_p, lead_status_fub, lead_status_ni, notes) FROM stdin;
162	18	high_potential	0	0	\N	\N	\N	0	\N	0	0	\N	\N	\N
163	18	potential	0	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	\N
164	18	facebook	0	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	\N
165	18	fair_leads	0	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	\N
166	18	follow_up	0	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	\N
167	18	other_not_reached	0	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	\N
168	18	new_cold_leads	0	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	\N
589	22	high_potential	7	1	2	\N	3	3	\N	3	\N	\N	\N	\N
590	22	potential	20	7	4	\N	11	11	\N	\N	\N	9	2	\N
591	22	facebook	107	10	20	29	59	59	\N	\N	\N	50	9	\N
592	22	fair_leads	\N	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	\N
593	22	follow_up	150	\N	35	20	55	55	\N	\N	\N	45	10	\N
594	22	other_not_reached	\N	\N	\N	\N	\N	0	\N	\N	\N	\N	\N	\N
595	22	new_cold_leads	7	3	\N	4	7	7	\N	\N	\N	3	4	\N
\.


--
-- Data for Name: daily_activity_reports; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.daily_activity_reports (id, employee_id, report_date, notes, status, created_at, updated_at, submitted_at) FROM stdin;
18	20260003	2026-11-10	{"client_contacts":[],"general_notes":null}	DRAFT	2026-11-10 05:38:13.349332+00	2026-11-10 05:38:38.217902+00	\N
21	20240119	2026-11-10	\N	DRAFT	2026-11-10 12:08:58.086761+00	2026-11-10 12:08:58.086761+00	\N
22	20240152	2026-11-10	{"client_contacts":[],"general_notes":null}	DRAFT	2026-11-10 12:11:03.457236+00	2026-11-10 12:11:12.909127+00	\N
23	2026005	2026-11-11	\N	DRAFT	2026-11-11 01:15:09.976647+00	2026-11-11 01:15:09.976647+00	\N
24	20240152	2026-11-11	\N	DRAFT	2026-11-11 04:50:33.422017+00	2026-11-11 04:50:33.422017+00	\N
25	2026005	2026-11-12	\N	DRAFT	2026-11-12 01:27:12.47577+00	2026-11-12 01:27:12.47577+00	\N
26	2026005	2026-11-13	\N	DRAFT	2026-11-13 09:43:09.039655+00	2026-11-13 09:43:09.039655+00	\N
27	2026005	2026-11-14	\N	DRAFT	2026-11-14 12:11:11.520248+00	2026-11-14 12:11:11.520248+00	\N
28	2026005	2026-11-16	\N	DRAFT	2026-11-16 09:16:10.892232+00	2026-11-16 09:16:10.892232+00	\N
\.


--
-- Data for Name: daily_targets; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.daily_targets (id, employee_id, effective_from, sales_target, tb_target, emi_target, outdoor_visit_target, dialed_calls_target, connected_calls_target, meeting_hours_target, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: meeting_activity_entries; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.meeting_activity_entries (id, report_id, activity_type, till_today_value, slot_10am_1pm, slot_2pm_5pm, slot_5pm_6pm, total_count, total_duration_minutes, notes) FROM stdin;
\.


--
-- Data for Name: milestone_checkpoints; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.milestone_checkpoints (id, month, employee_id, checkpoint_day, label, new_sales, emi, total_collection, total_lead, fair_lead, fb_lead, hp, p, fup, outdoor_visits, indoor_cx, admin_notes, updated_by_id, created_at, updated_at, total_calls, sold_fair, sold_fb, sold_other, gl, hold, cancel) FROM stdin;
\.


--
-- Data for Name: notices; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.notices (id, title, notice_type, content, file_url, file_name, status, priority, created_by_id, approved_by_id, approval_note, approved_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sales_collection_entries; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.sales_collection_entries (id, report_id, category, description, amount, payment_sequence, customer_name, customer_phone, payment_method, reference, notes, expected_payment_date, reschedule_count, reschedule_history, created_at, commitment_percentage) FROM stdin;
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.teams (id, name, director_name, display_order, is_active, created_at, updated_at) FROM stdin;
1	Gazi Sir Group	Gazi Sir	1	t	2026-11-04 11:37:34.856257+00	2026-11-11 14:28:20.075328+00
2	Hasib Sir Group	Hasib Sir	2	t	2026-11-04 11:37:34.856257+00	2026-11-11 14:28:33.763636+00
24	Gazi Sir Team	Gazi Sir	1	t	2026-11-12 05:40:16.216587+00	2026-11-12 05:40:16.216587+00
25	Hasib Sir Team	Hasib Sir	2	t	2026-11-12 05:40:16.216587+00	2026-11-12 05:40:16.216587+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: sunset_user
--

COPY public.users (id, full_name, email, phone, username, password_hash, role, is_active, created_at, updated_at, designation, team_id, reporting_manager_id, client_count, client_share_count) FROM stdin;
2026001	Sunset Admin	sunsetgroupbd@gmail.com	\N	admin	$2b$12$4iPzkKbLJyCS8prxK0CNu.bAETWEWB8whS4EYOoBrg7nIew.SV9m.	ADMIN	t	2026-10-28 08:34:06.354346+00	2026-10-28 08:53:49.411426+00	\N	\N	\N	0	0
20240063	Sheikh Eitty Akter Moon	sheikh.moon@sunsetgroupbd.com	01332508948	sheikh.moon	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-06 11:44:26.346158+00	Asst. Manager (Sales & Marketing)	\N	\N	0	0
2026005	Prity Akter	prity.akter@sunsetgroupbd.com	01335114195	prity.akter	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-06 11:44:26.346158+00	Executive (Sales & Marketing)	\N	\N	0	0
20260025	Md. Younush Ali	younush.ali@sunsetgroupbd.com	01335114184	younush.ali	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-06 11:44:26.346158+00	Asst. Manager (Sales & Marketing)	\N	\N	0	0
20240064	Momtaz Parvin Mou	momtaz.mou@sunsetgroupbd.com	01332508956	momtaz.mou	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	CO	t	2026-11-06 11:44:26.346158+00	2026-11-10 07:03:00.591834+00	Manager (Sales & Marketing)	1	\N	0	0
20240145	S. M. Wajed Hossain	wajed.hossain@sunsetgroupbd.com	01335114188	wajed.hossain	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	CO	t	2026-11-06 11:44:26.346158+00	2026-11-10 07:04:45.089681+00	Asst. Manager (Sales & Marketing)	1	\N	0	0
20240118	Dipankar Roy	dipankar.roy@sunsetgroupbd.com	01313362358	dipankar.roy	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	CO	t	2026-11-06 11:44:26.346158+00	2026-11-10 08:46:25.571136+00	Manager (Sales & Marketing)	2	\N	0	0
20240082	Soumen Bala	soumen.bala@sunsetgroupbd.com	01325074527	soumen.bala	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	CO	t	2026-11-06 11:44:26.346158+00	2026-11-10 08:46:58.973603+00	Deputy Manager (Sales & Marketing)	2	\N	0	0
20240066	Nahid Hasan Emon	nahid.emon@sunsetgroupbd.com	01332508947	nahid.emon	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	CO	t	2026-11-06 11:44:26.346158+00	2026-11-10 08:47:21.733059+00	Manager (Sales & Marketing)	2	\N	0	0
20240116	Farjana Akter	farjana.akter@sunsetgroupbd.com	01325074538	farjana.akter	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:45:27.821888+00	Sr. Executive (Sales & Marketing)	1	20240091	0	0
20240154	Md. Al Amin Sheikh	al.amin@sunsetgroupbd.com	01313362351	al.amin	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:50:23.672178+00	Sr. Executive (Sales & Marketing)	1	20240064	0	0
20240152	Suraiya Subrin	suraiya.subrin@sunsetgroupbd.com	01335114185	suraiya.subrin	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:44:19.288491+00	Sr. Executive (Sales & Marketing)	2	20240119	0	0
20240062	Mariam Khanam	mariam.khanam@sunsetgroupbd.com	01332508943	mariam.khanam	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:51:52.414304+00	Deputy Manager (Sales & Marketing)	2	20240066	0	0
20240161	Md. Istiak Tanvir Sarkar	istiak.sarkar@sunsetgroupbd.com	01335114189	istiak.sarkar	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:54:53.438033+00	Sr. Executive (Sales & Marketing)	2	20240118	0	0
20240176	Anik Chandra Biswas	anik.biswas@sunsetgroupbd.com	01332841667	anik.biswas	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:54:06.436113+00	Sr. Executive (Sales & Marketing)	2	20240082	0	0
20240166	S.M. Shohag	shohag@sunsetgroupbd.com	01332841664	shohag	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:52:02.458149+00	Asst. Manager (Sales & Marketing)	2	20240066	0	0
20260015	Tasmina Sultana	tasmina.sultana@sunsetgroupbd.com	01335114180	tasmina.sultana	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:57:33.124543+00	Executive (Sales & Marketing)	1	20260003	0	0
20240119	Kishan Chandra Das	kishan.das@sunsetgroupbd.com	01332841665	kishan.das	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:43:29.430665+00	Jr. Asst. Manager (Sales & Marketing)	2	20240082	0	0
20240129	Mehjabin Akter Adita	mehjabin.adita@sunsetgroupbd.com	01313362354	mehjabin.adita	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:52:10.335152+00	Asst. Manager (Sales & Marketing)	2	20240066	0	0
20240075	Rabika Mahjabin Mawshi	rabika.mawshi@sunsetgroupbd.com	01325074534	rabika.mawshi	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 10:14:56.932684+00	Asst. Manager (Sales & Marketing)	\N	\N	0	0
20240133	Polton Kumer Sarker	polton.sarker@sunsetgroupbd.com	01332841666	polton.sarker	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:54:32.02223+00	Asst. Manager (Sales & Marketing)	2	20240118	0	0
20240163	Sadia Kondokar Nishat	sadia.nishat@sunsetgroupbd.com	01335114186	sadia.nishat	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:53:17.178977+00	Asst. Manager (Sales & Marketing)	2	20240082	0	0
20240120	Kamruz Zahan Juthy	kamruz.juthy@sunsetgroupbd.com	01313362343	kamruz.juthy	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:45:43.203905+00	Asst. Manager (Sales & Marketing)	1	20240091	0	0
20260016	Rehena Pervin	rehena.pervin@sunsetgroupbd.com	01313362350	rehena.pervin	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:44:19.288491+00	Executive (Sales & Marketing)	2	20240119	0	0
20240059	Abu Jafar	abu.jafar@sunsetgroupbd.com	01332508958	abu.jafar	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:45:02.454231+00	Asst. Manager (Sales & Marketing)	1	20240091	0	0
20260010	Afia Fairooz	afia.fairooz@sunsetgroupbd.com	01335114182	afia.fairooz	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:58:18.719396+00	Sr. Executive (Sales & Marketing)	2	20240062	0	0
20240186	Anamika Akter	anamika.akter@sunsetgroupbd.com	01325074529	anamika.akter	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:59:20.814645+00	Executive (Sales & Marketing)	2	20240129	0	0
20240099	Sadia Islam Susmita	sadia.susmita@sunsetgroupbd.com	01332841669	sadia.susmita	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:59:51.21438+00	Executive (Sales & Marketing)	2	20240166	0	0
20260011	Mikra Marma	mikra.marma@sunsetgroupbd.com	01313362340	mikra.marma	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:59:51.21438+00	Sr. Executive (Sales & Marketing)	2	20240166	0	0
20260032	Mousumi Akter	mousumi.akter@sunsetgroupbd.com	01313362346	mousumi.akter	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:02:05.702838+00	Executive (Sales & Marketing)	2	20240163	0	0
20260027	Momotaz Begum Eitty	momotaz.eitty@sunsetgroupbd.com	01313362345	momotaz.eitty	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:03:32.365963+00	Asst. Manager (Sales & Marketing)	2	20240133	0	0
20260106	Syeda Arifa Yeasmin	syeda.yeasmin@sunsetgroupbd.com	01335223405	syeda.yeasmin	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-06 11:44:26.346158+00	Jr. Executive (Sales & Marketing)	\N	\N	0	0
20260107	Rohana Ferdous Jahan	rohana.jahan@sunsetgroupbd.com	01335223403	rohana.jahan	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-06 11:44:26.346158+00	Jr. Executive (Sales & Marketing)	\N	\N	0	0
20260109	Md Mashrafi Ahmed	mashrafi.ahmed@sunsetgroupbd.com	01335223413	mashrafi.ahmed	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-06 11:44:26.346158+00	Jr. Executive (Sales & Marketing)	\N	\N	0	0
20260113	Rotna Khatun	rotna.khatun@sunsetgroupbd.com	01335114183	rotna.khatun	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-06 11:44:26.346158+00	Executive (Sales & Marketing)	\N	\N	0	0
20260118	Md. Zahid Hasan	zahid.hasan@sunsetgroupbd.com	\N	zahid.hasan	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-06 11:44:26.346158+00	Asst. Manager (Sales & Marketing)	\N	\N	0	0
20260048	Habiba Sultana	habiba.sultana@sunsetgroupbd.com	01335241125	habiba.sultana	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:56:38.688114+00	Executive (Sales & Marketing)	1	20240116	0	0
20260047	Champa Khatun	champa.khatun@sunsetgroupbd.com	01335241128	champa.khatun	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:44:19.288491+00	Executive (Sales & Marketing)	2	20240119	0	0
20260099	Samima Islam Nima	samima.nima@sunsetgroupbd.com	01335223424	samima.nima	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:46:54.326943+00	Jr. Executive (Sales & Marketing)	1	20240059	0	0
20260072	Sumaia Akter	sumaia.akter@sunsetgroupbd.com	01335223407	sumaia.akter	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:49:08.601034+00	Jr. Executive (Sales & Marketing)	1	20240064	0	0
20260066	Moriom Akter	moriom.akter@sunsetgroupbd.com	01335223401	moriom.akter	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:57:01.483978+00	Jr. Executive (Sales & Marketing)	1	20240120	0	0
20260069	Tabassom Khanam	tabassom.khanam@sunsetgroupbd.com	01332508953	tabassom.khanam	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:57:01.483978+00	Jr. Executive (Sales & Marketing)	1	20240120	0	0
20260112	Sajjad Hossain Sohag	sajjad.sohag@sunsetgroupbd.com	01335114194	sajjad.sohag	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:57:33.124543+00	Sr. Executive (Sales & Marketing)	1	20260003	0	0
20260114	Annapourna Sarker	annapourna.sarker@sunsetgroupbd.com	\N	annapourna.sarker	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:58:18.719396+00	Jr. Executive (Sales & Marketing)	2	20240062	0	0
20260037	Samir Ahmed	samir.ahmed@sunsetgroupbd.com	01335241126	samir.ahmed	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:59:20.814645+00	Executive (Sales & Marketing)	2	20240129	0	0
20260102	Md. Monjurul Islam	monjurul.islam@sunsetgroupbd.com	01335114197	monjurul.islam	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:00:01.716298+00	Executive (Sales & Marketing)	2	20240166	0	0
20260100	Kakuly Akter	kakuly.akter@sunsetgroupbd.com	01335114192	kakuly.akter	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:02:23.207347+00	Executive (Sales & Marketing)	2	20240163	0	0
20260079	Tithi Biswas	tithi.biswas@sunsetgroupbd.com	01335223410	tithi.biswas	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:02:55.024092+00	Sr. Executive (Sales & Marketing)	2	20240176	0	0
20260083	Shipon Chandro Kritonia	shipon.kritonia@sunsetgroupbd.com	01335223414	shipon.kritonia	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:03:32.365963+00	Executive (Sales & Marketing)	2	20240133	0	0
20260091	Noor Mohammad	noor.mohammad@sunsetgroupbd.com	01334223422	noor.mohammad	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:03:40.192377+00	Executive (Sales & Marketing)	2	20240133	0	0
20260088	Md. Suwaib Ahmed	suwaib.ahmed@sunsetgroupbd.com	01335223417	suwaib.ahmed	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:04:13.365497+00	Executive (Sales & Marketing)	2	20240161	0	0
20260090	Suraiya Khatun	suraiya.khatun@sunsetgroupbd.com	01335223419	suraiya.khatun	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:05:03.562958+00	Executive (Sales & Marketing)	1	20240154	0	0
20260096	Saoda Binta Karim	saoda.karim@sunsetgroupbd.com	01335241121	saoda.karim	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:05:03.562958+00	Jr. Executive (Sales & Marketing)	1	20240154	0	0
20260117	Shihab Uddin	shihab.uddin@sunsetgroupbd.com	\N	shihab.uddin	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:05:03.562958+00	Executive (Sales & Marketing)	1	20240154	0	0
20260073	Samia Akhond	samia.akhond@sunsetgroupbd.com	01335223408	samia.akhond	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:05:33.200566+00	Jr. Executive (Sales & Marketing)	1	20260040	0	0
20260074	Kaniz Fatema Mukta	kaniz.mukta@sunsetgroupbd.com	01335223409	kaniz.mukta	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:05:33.200566+00	Jr. Executive (Sales & Marketing)	1	20260040	0	0
20260105	Tanvir Rashid Hemal	tanvir.hemal@sunsetgroupbd.com	01335114196	tanvir.hemal	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:05:33.200566+00	Jr. Executive (Sales & Marketing)	1	20260040	0	0
20260051	Most. Shraboni Chowdhury Snigdha	shraboni.snigdha@sunsetgroupbd.com	01335241137	shraboni.snigdha	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:05:47.578568+00	Executive (Sales & Marketing)	1	20260040	0	0
20260098	Md. Habibur Rahman	habibur.rahman@sunsetgroupbd.com	01335223423	habibur.rahman	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:06:19.098393+00	Executive (Sales & Marketing)	1	20260072	0	0
20260115	Tanvir Ahmed Mollah	tanvir.mollah@sunsetgroupbd.com	\N	tanvir.mollah	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:06:19.098393+00	Executive (Sales & Marketing)	1	20260072	0	0
20240091	Md Mizanur Rahman	mizanur.rahman@sunsetgroupbd.com	01332841662	mizanur.rahman	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	CO	t	2026-11-06 11:44:26.346158+00	2026-11-10 07:02:27.154123+00	Manager (Sales & Marketing)	1	\N	0	0
20260040	Fayzunnessa Haque	fayzunnessa.haque@sunsetgroupbd.com	01335241133	fayzunnessa.haque	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:48:26.625633+00	Asst. Manager (Sales & Marketing)	1	20240064	0	0
20260003	Md. Jakaria Sarker	jakaria.sarker@sunsetgroupbd.com	01335114187	jakaria.sarker	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	TL	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:51:12.857713+00	Sr. Executive (Sales & Marketing)	1	20240145	0	0
20260116	Syed Md Atef Bokhtiar	syed.bokhtiar@sunsetgroupbd.com	\N	syed.bokhtiar	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 11:56:38.688114+00	Sr. Executive (Sales & Marketing)	1	20240116	0	0
20260089	Md. Sabbir Ahmed Zitu	sabbir.zitu@sunsetgroupbd.com	01335223418	sabbir.zitu	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:02:55.024092+00	Jr. Executive (Sales & Marketing)	2	20240176	0	0
20260097	Nusrat Jahan	nusrat.jahan@sunsetgroupbd.com	01313362344	nusrat.jahan	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:02:55.024092+00	Jr. Executive (Sales & Marketing)	2	20240176	0	0
20260119	Mousumi Akter	mousumi.akter2@sunsetgroupbd.com	\N	mousumi.akter2	$2b$12$klOP.hvUfSle1Pfs6hLr7.43MPSJFrJXlhZuLFpdNk4FbcS7Y6zlK	EMPLOYEE	t	2026-11-06 11:44:26.346158+00	2026-11-10 12:04:13.365497+00	\N	2	20240161	0	0
\.


--
-- Name: app_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.app_settings_id_seq', 2, true);


--
-- Name: call_activity_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.call_activity_entries_id_seq', 595, true);


--
-- Name: daily_activity_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.daily_activity_reports_id_seq', 28, true);


--
-- Name: daily_targets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.daily_targets_id_seq', 1, false);


--
-- Name: meeting_activity_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.meeting_activity_entries_id_seq', 1, false);


--
-- Name: milestone_checkpoints_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.milestone_checkpoints_id_seq', 1, false);


--
-- Name: notices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.notices_id_seq', 1, false);


--
-- Name: sales_collection_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.sales_collection_entries_id_seq', 1, false);


--
-- Name: teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.teams_id_seq', 51, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sunset_user
--

SELECT pg_catalog.setval('public.users_id_seq', 1, false);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: call_activity_entries call_activity_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.call_activity_entries
    ADD CONSTRAINT call_activity_entries_pkey PRIMARY KEY (id);


--
-- Name: daily_activity_reports daily_activity_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.daily_activity_reports
    ADD CONSTRAINT daily_activity_reports_pkey PRIMARY KEY (id);


--
-- Name: daily_targets daily_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.daily_targets
    ADD CONSTRAINT daily_targets_pkey PRIMARY KEY (id);


--
-- Name: meeting_activity_entries meeting_activity_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.meeting_activity_entries
    ADD CONSTRAINT meeting_activity_entries_pkey PRIMARY KEY (id);


--
-- Name: milestone_checkpoints milestone_checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.milestone_checkpoints
    ADD CONSTRAINT milestone_checkpoints_pkey PRIMARY KEY (id);


--
-- Name: notices notices_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_pkey PRIMARY KEY (id);


--
-- Name: sales_collection_entries sales_collection_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.sales_collection_entries
    ADD CONSTRAINT sales_collection_entries_pkey PRIMARY KEY (id);


--
-- Name: teams teams_name_key; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_name_key UNIQUE (name);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: call_activity_entries uq_call_report_category; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.call_activity_entries
    ADD CONSTRAINT uq_call_report_category UNIQUE (report_id, lead_category);


--
-- Name: daily_activity_reports uq_employee_report_date; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.daily_activity_reports
    ADD CONSTRAINT uq_employee_report_date UNIQUE (employee_id, report_date);


--
-- Name: meeting_activity_entries uq_meeting_report_activity; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.meeting_activity_entries
    ADD CONSTRAINT uq_meeting_report_activity UNIQUE (report_id, activity_type);


--
-- Name: app_settings uq_settings_namespace_key; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT uq_settings_namespace_key UNIQUE (namespace, key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_app_settings_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_app_settings_id ON public.app_settings USING btree (id);


--
-- Name: ix_app_settings_namespace; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_app_settings_namespace ON public.app_settings USING btree (namespace);


--
-- Name: ix_call_activity_entries_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_call_activity_entries_id ON public.call_activity_entries USING btree (id);


--
-- Name: ix_call_activity_entries_report_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_call_activity_entries_report_id ON public.call_activity_entries USING btree (report_id);


--
-- Name: ix_daily_activity_reports_employee_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_daily_activity_reports_employee_id ON public.daily_activity_reports USING btree (employee_id);


--
-- Name: ix_daily_activity_reports_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_daily_activity_reports_id ON public.daily_activity_reports USING btree (id);


--
-- Name: ix_daily_activity_reports_report_date; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_daily_activity_reports_report_date ON public.daily_activity_reports USING btree (report_date);


--
-- Name: ix_daily_targets_effective_from; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_daily_targets_effective_from ON public.daily_targets USING btree (effective_from);


--
-- Name: ix_daily_targets_employee_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_daily_targets_employee_id ON public.daily_targets USING btree (employee_id);


--
-- Name: ix_daily_targets_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_daily_targets_id ON public.daily_targets USING btree (id);


--
-- Name: ix_mc_emp; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_mc_emp ON public.milestone_checkpoints USING btree (employee_id);


--
-- Name: ix_mc_month; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_mc_month ON public.milestone_checkpoints USING btree (month);


--
-- Name: ix_meeting_activity_entries_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_meeting_activity_entries_id ON public.meeting_activity_entries USING btree (id);


--
-- Name: ix_meeting_activity_entries_report_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_meeting_activity_entries_report_id ON public.meeting_activity_entries USING btree (report_id);


--
-- Name: ix_notices_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_notices_id ON public.notices USING btree (id);


--
-- Name: ix_notices_status; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_notices_status ON public.notices USING btree (status);


--
-- Name: ix_sales_collection_entries_category; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_sales_collection_entries_category ON public.sales_collection_entries USING btree (category);


--
-- Name: ix_sales_collection_entries_expected_payment_date; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_sales_collection_entries_expected_payment_date ON public.sales_collection_entries USING btree (expected_payment_date);


--
-- Name: ix_sales_collection_entries_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_sales_collection_entries_id ON public.sales_collection_entries USING btree (id);


--
-- Name: ix_sales_collection_entries_report_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_sales_collection_entries_report_id ON public.sales_collection_entries USING btree (report_id);


--
-- Name: ix_teams_name; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_teams_name ON public.teams USING btree (name);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_id; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE INDEX ix_users_id ON public.users USING btree (id);


--
-- Name: ix_users_username; Type: INDEX; Schema: public; Owner: sunset_user
--

CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username);


--
-- Name: call_activity_entries call_activity_entries_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.call_activity_entries
    ADD CONSTRAINT call_activity_entries_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.daily_activity_reports(id) ON DELETE CASCADE;


--
-- Name: daily_activity_reports daily_activity_reports_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.daily_activity_reports
    ADD CONSTRAINT daily_activity_reports_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: daily_targets daily_targets_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.daily_targets
    ADD CONSTRAINT daily_targets_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: meeting_activity_entries meeting_activity_entries_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.meeting_activity_entries
    ADD CONSTRAINT meeting_activity_entries_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.daily_activity_reports(id) ON DELETE CASCADE;


--
-- Name: milestone_checkpoints milestone_checkpoints_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.milestone_checkpoints
    ADD CONSTRAINT milestone_checkpoints_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: milestone_checkpoints milestone_checkpoints_updated_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.milestone_checkpoints
    ADD CONSTRAINT milestone_checkpoints_updated_by_id_fkey FOREIGN KEY (updated_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notices notices_approved_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_approved_by_id_fkey FOREIGN KEY (approved_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notices notices_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sales_collection_entries sales_collection_entries_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.sales_collection_entries
    ADD CONSTRAINT sales_collection_entries_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.daily_activity_reports(id) ON DELETE CASCADE;


--
-- Name: users users_reporting_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_reporting_manager_id_fkey FOREIGN KEY (reporting_manager_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sunset_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict pimgzwdIcqzcMg7w23Cj8xANT8DU0UqL8nGFJLkDDt6aWRhApqwB6f2N22GN1Sl

