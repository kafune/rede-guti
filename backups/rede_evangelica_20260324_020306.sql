--
-- PostgreSQL database dump
--

\restrict hcjbAk0ni68TxWKwXXzUmnc4hG0jSQdyJtEfH7lmqqSPKogUHXPsHwFDQ9XY96T

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

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

ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_indicated_by_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.indications DROP CONSTRAINT IF EXISTS indications_municipality_id_fkey;
ALTER TABLE IF EXISTS ONLY public.indications DROP CONSTRAINT IF EXISTS indications_indicated_by_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.indications DROP CONSTRAINT IF EXISTS indications_created_by_id_fkey;
ALTER TABLE IF EXISTS ONLY public.indications DROP CONSTRAINT IF EXISTS indications_church_id_fkey;
DROP INDEX IF EXISTS public.users_role_idx;
DROP INDEX IF EXISTS public.users_indicated_by_user_id_idx;
DROP INDEX IF EXISTS public.users_email_key;
DROP INDEX IF EXISTS public.municipalities_name_state_code_key;
DROP INDEX IF EXISTS public.indications_municipality_id_idx;
DROP INDEX IF EXISTS public.indications_indicated_by_user_id_idx;
DROP INDEX IF EXISTS public.indications_created_by_id_idx;
DROP INDEX IF EXISTS public.indications_created_at_idx;
DROP INDEX IF EXISTS public.indications_church_id_idx;
DROP INDEX IF EXISTS public.churches_name_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.municipalities DROP CONSTRAINT IF EXISTS municipalities_pkey;
ALTER TABLE IF EXISTS ONLY public.indications DROP CONSTRAINT IF EXISTS indications_pkey;
ALTER TABLE IF EXISTS ONLY public.churches DROP CONSTRAINT IF EXISTS churches_pkey;
ALTER TABLE IF EXISTS ONLY public.app_config DROP CONSTRAINT IF EXISTS app_config_pkey;
ALTER TABLE IF EXISTS ONLY public._prisma_migrations DROP CONSTRAINT IF EXISTS _prisma_migrations_pkey;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.municipalities;
DROP TABLE IF EXISTS public.indications;
DROP TABLE IF EXISTS public.churches;
DROP TABLE IF EXISTS public.app_config;
DROP TABLE IF EXISTS public._prisma_migrations;
DROP TYPE IF EXISTS public."Role";
--
-- Name: Role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."Role" AS ENUM (
    'COORDENADOR',
    'LIDER_REGIONAL',
    'LIDER_LOCAL'
);


ALTER TYPE public."Role" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Name: app_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_config (
    id text NOT NULL,
    whatsapp_group_link text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.app_config OWNER TO postgres;

--
-- Name: churches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.churches (
    id text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.churches OWNER TO postgres;

--
-- Name: indications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.indications (
    id text NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    indicated_by text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by_id text NOT NULL,
    church_id text NOT NULL,
    municipality_id text NOT NULL,
    indicated_by_user_id text
);


ALTER TABLE public.indications OWNER TO postgres;

--
-- Name: municipalities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.municipalities (
    id text NOT NULL,
    name text NOT NULL,
    state_code text DEFAULT 'SP'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.municipalities OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role public."Role" DEFAULT 'LIDER_LOCAL'::public."Role" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    devzapp_link text,
    name text,
    indicated_by_user_id text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
8b1ba48c-1869-4022-b105-b5a58382d75a	6d8e9e3438f9a096345f9295544c443702d6d07da149fa8d60068360021b6248	2026-03-18 22:14:30.792143+00	20260121232917_init	\N	\N	2026-03-18 22:14:30.731054+00	1
3c8620d9-a717-437d-a35c-1308754ad251	e479fb46e0dc830393f7e470d16bff1962c120a6827c0e0a8b0cdd7fd69c782a	2026-03-18 22:14:30.796336+00	20260122030256_add_user_profile	\N	\N	2026-03-18 22:14:30.792848+00	1
d3d575d9-de45-4450-91a8-cb822b37af10	f094710ea07d51d2f83e434dff156cefdec74e7604022fd942566211422015c0	2026-03-19 03:05:39.637802+00	20260318230000_user_hierarchy_profiles	\N	\N	2026-03-19 03:05:39.532628+00	1
bf896d85-15cc-4f3d-b1a9-37b6abc0cb93	3b85776c77f1944aec754984ba58e14dc3af22d32955e52f281bad4ed04d5920	2026-03-19 03:21:39.546858+00	20260319013000_add_app_config	\N	\N	2026-03-19 03:21:39.526353+00	1
\.


--
-- Data for Name: app_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.app_config (id, whatsapp_group_link, created_at, updated_at) FROM stdin;
default	https://chat.whatsapp.com/ECF9oFj77Gc0x0IQ5GHNOl	2026-03-20 02:00:11.002	2026-03-20 02:02:35.772
\.


--
-- Data for Name: churches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.churches (id, name, created_at) FROM stdin;
cmmww6vlf000101pddy8x307n	ashdgahjsda	2026-03-19 03:10:07.731
cmmww7fya000401pd1vkwouqb	Iead gru	2026-03-19 03:10:34.114
cmmxfdbk5000001o5pangol1w	Assembleia de Deus Madureira	2026-03-19 12:07:01.055
cmmy96cw0000001qb0krnzn72	Sede	2026-03-20 02:01:24.672
cmmy98a4j000201qbk2rb7t26	asdasd	2026-03-20 02:02:54.403
cmmyv2ytx000501qbb765ldnk	Assembleia de Deus revivendo na palavra	2026-03-20 12:14:38.037
cmmyvb7d2000801qbci7mle0c	AD.cidade soberana	2026-03-20 12:21:02.342
cmmyvhcb1000a01qb6qy8ko1y	Nasci Pra Deus	2026-03-20 12:25:48.685
cmmywseuo000f01qb65rovgyn	ADMaua madureira	2026-03-20 13:02:24.816
cmmz1q5gz000j01qbuku2isi7	Batista Tov	2026-03-20 15:20:37.427
cmmz4nway000l01qbqe378sfw	AD. Brás Guarulhos	2026-03-20 16:42:51.081
cmmz8kje5000p01qbjxcymirh	Paróquia São Roque	2026-03-20 18:32:12.845
cmmzcdkw3000r01qb0d27ng28	Não Evangélico	2026-03-20 20:18:46.659
cmmzd887u000t01qbm81msn1x	Igreja Internacional da Graça	2026-03-20 20:42:36.57
cmmzf4sdj000z01qb21o6a3y6	Bola	2026-03-20 21:35:55.303
cmmzkjk7s001301qbdjg5asmz	Igreja Cristã Monte Moriah	2026-03-21 00:07:22.648
cmmzkjmnp001601qbo7hpuw78	AD	2026-03-21 00:07:25.813
cmmzkpmdy001901qbsv8h8pah	Assembleia de Deus parque São Rafael	2026-03-21 00:12:05.398
cmmzksl8j001b01qbbffva6ks	Igreja Eleitos em Cristo	2026-03-21 00:14:23.874
cmmzkwc8o001d01qb64oe59iq	nenhuma	2026-03-21 00:17:18.84
cmmzla11o001h01qbatpvwlpl	Ev. Desígnio de Deus	2026-03-21 00:27:57.516
cmmzlkwhh001k01qbhr0h8f8o	Congregação do Brasil	2026-03-21 00:36:24.821
cmmzltz0r001m01qb9skag3xh	Rede evangélica SP	2026-03-21 00:43:28.011
cmmznlgi0001q01qbkh7ghr9m	AD Belém Campinas	2026-03-21 01:32:49.992
cmmzoquvs001s01qbvxplgm4g	Igreja E.C.T. de Esperança	2026-03-21 02:05:01.528
cmmzp2he9001u01qbi8gzbvlf	Ágape Resgatando Vidas	2026-03-21 02:14:03.921
cmn093zla001y01qbeq6s136o	Graça para Hoje	2026-03-21 11:35:06.477
cmn0aktye002001qb9z8am29n	AD. Brás Guarulhos  JD Pres Dutra	2026-03-21 12:16:11.942
cmn0b1gxt002201qbvowmb72f	Ad revivendo na palavra	2026-03-21 12:29:08.225
cmn0d8ebs002401qb389chfbj	Palavra de vida	2026-03-21 13:30:30.664
cmn0hefs9002801qbvt2cdws7	Assembleia de Deus ministério Smpta	2026-03-21 15:27:10.953
cmn0ho3bj002a01qbzo86goz6	O poder da palavra	2026-03-21 15:34:41.359
cmn0ivc2g002c01qbehsg4q9n	Igreja Apostólica Multiplicadores	2026-03-21 16:08:18.904
cmn0kns8s002g01qbrct407vl	Ass.de Deus paulistana	2026-03-21 16:58:25.852
cmn0lzbei002j01qb5n7fyc41	Batista	2026-03-21 17:35:23.514
cmn0n7z8n002m01qbff5o0ct2	Itatinga	2026-03-21 18:10:07.271
cmn0nqh6g002q01qbexw8xni4	Ministério amo graças em célula	2026-03-21 18:24:30.328
cmn0nvr6n002s01qbqq55bsqb	AD. Do belem	2026-03-21 18:28:36.575
cmn0nx015002u01qbguwsba27	Missão Global	2026-03-21 18:29:34.697
cmn0nyfm3002w01qbqru9i328	Missao global	2026-03-21 18:30:41.547
cmn0o0sw9002y01qb8fbcjofz	Assembleia de DEUS da missão	2026-03-21 18:32:32.073
cmn0o8b75003201qbb86spngp	tabernaculo da verdade	2026-03-21 18:38:22.385
cmn0o96yu003401qbvakmt5v7	Geração forte	2026-03-21 18:39:03.558
cmn0oe1wy003601qby5p9dacw	igreja tabernaculo da verdade	2026-03-21 18:42:50.29
cmn0oqy9i003901qbtitjgt1e	ADPSR	2026-03-21 18:52:52.086
cmn0p7rm5003b01qbe6fapkg2	Nossa Senhora do Carmo	2026-03-21 19:05:56.621
cmn0pcoob003d01qbeolk2y91	Bispo invan esclbri	2026-03-21 19:09:46.091
cmn0phmtu003i01qbz4ln247z	Iingreja profeica missão global	2026-03-21 19:13:36.978
cmn0pnmzg003k01qb8pihgwuy	Itatingap	2026-03-21 19:18:17.116
cmn0qqwrp003p01qbtpky2nhp	Videira barra funda	2026-03-21 19:48:49.381
cmn0svydt003t01qb9xx5eyq7	Igreja Profética missão Global	2026-03-21 20:48:43.985
cmn0trems003v01qblve9n66q	Assembleia de Deus	2026-03-21 21:13:11.38
cmn0wf64x003x01qbt74ldnn0	ADIPE	2026-03-21 22:27:39.345
cmn0zkust004201qb1d6ve9ep	ADPSR jardim nova América	2026-03-21 23:56:03.437
cmn0zujmb004401qbuhz7mq82	Ad.Paulistana Guarujá	2026-03-22 00:03:35.507
cmn11hbon004801qb5czj5fic	Igreja Evangélica Corpo de Cristo (IECC)	2026-03-22 00:49:17.927
cmn136fy2004a01qb0bwzay5b	Fead	2026-03-22 01:36:49.466
cmn16oeke004e01qbjkrf33tl	Renascer em Cristo Botucatu	2026-03-22 03:14:46.334
cmn18aywd004h01qbdsdl5hn1	Ministério mudança de vida	2026-03-22 04:00:18.733
cmn1sy1im004m01qb9aejnb6v	AD Ministerio Semeando vidas	2026-03-22 13:38:07.534
cmn1t5xm8004o01qb5rolv708	Presbiteriana	2026-03-22 13:44:15.728
cmn1valnu004r01qb4ctzb2ir	Assembleia de Deus Church	2026-03-22 14:43:52.746
cmn1xdoc0004v01qbaa6x54hr	Igreja Pentecostal Tocai A Trombeta em Sião	2026-03-22 15:42:15.408
cmn1xtbd2004x01qb2xxqttrm	Igreja  forte em cristo	2026-03-22 15:54:25.094
cmn23ni4a005401qbuyqja3my	Igreja evangelica iede deus	2026-03-22 18:37:51.61
cmn2426d9005601qbeqzc9uuo	Bíblica moria	2026-03-22 18:49:16.221
cmn26le0h005901qbhwdsujbf	ONG Normandia bairro dos pimentas	2026-03-22 20:00:11.825
cmn2adt2o005b01qbf1es7mq6	Igreja mundial	2026-03-22 21:46:16.56
cmn2azdqx005e01qb2ki5labp	Poder gloria e milagre	2026-03-22 22:03:03.129
cmn2cbppm005k01qb6bknvj6f	Missao global(bispo Ivan)	2026-03-22 22:40:38.122
cmn2fxgcw000101ocgmncvaku	AD Ministerio	2026-03-23 00:21:31.28
cmn2g01p3000401oc83h39u1v	Universai	2026-03-23 00:23:32.247
cmn2kux4w000001p9amuebq5u	Batista cenáculo da verdade	2026-03-23 02:39:31.136
cmn2kxxsl000301p9s925kul1	Gagw	2026-03-23 02:41:51.957
cmn2l227h000101oazt5ssso9	Ministério da Cruz	2026-03-23 02:45:04.301
cmn2lhczn000101jyq675ax4d	asdfgahnsd	2026-03-23 02:56:58.115
cmn2lxzq0000001pxo4gey8a5	saghfdads	2026-03-23 03:09:54.071
cmn2m0i91000301px695ul1g2	Igreja Apostólica Shalom Adonai	2026-03-23 03:11:51.397
cmn2mnx0s000501px5sjg9pzw	Evangelica	2026-03-23 03:30:03.628
cmn2mrl1u000701pxd3v32j0l	Pentecostal	2026-03-23 03:32:54.738
cmn3cdacp000c01px4diud1t2	Igreja Pentecostal Assembleia de Deus no Jabaquara	2026-03-23 15:29:37.705
cmn3e50yo000j01px0ukfje71	Católica	2026-03-23 16:19:11.52
cmn3eas4g000l01px6evbgjqn	Assembleia Reino de Deus	2026-03-23 16:23:40
cmn3enj8m000q01pxicntoa1h	Missak Global	2026-03-23 16:33:35.013
cmn3esnx0000x01pxihhappks	Deus Proverá	2026-03-23 16:37:34.356
cmn3f6jph001201pxs6xtnyav	DESIGREJADO	2026-03-23 16:48:22.085
cmn3fe58u001601pxekm7mnwe	ONG Normandia escolinha de futebol  bairro dos pimentas	2026-03-23 16:54:16.59
cmn3jnrbr001f01pxhe78ue3o	Igre apostólica nova paz em Cristo	2026-03-23 18:53:43.575
cmn3nal8z001m01pxpt39mxug	Belem	2026-03-23 20:35:27.635
cmn3q14rl001v01pxq12p7rnv	Igreja profetica missao global	2026-03-23 21:52:05.217
cmn3q2vc2001x01pxrdx1o3nh	Sem igreja	2026-03-23 21:53:26.306
cmn3rduel002001pxj1coum19	Igreja após nova paz em Cristo	2026-03-23 22:29:57.933
cmn3ru7ep002201px9yo6f8mx	Ad dos milagres	2026-03-23 22:42:41.281
cmn3ycf49002501pxxyyatn0m	AD Belém Hortolândia	2026-03-24 01:44:48.777
\.


--
-- Data for Name: indications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.indications (id, name, phone, email, indicated_by, created_at, created_by_id, church_id, municipality_id, indicated_by_user_id) FROM stdin;
cmmyvb7d6000901qb44p4s0sm	Elias Inácio da Silva	5511960918290	pr.eliasinacio@outlook.com	Gean Cardoso	2026-03-20 12:21:02.346	cmmy9t8m80000mykwoqn6jfu3	cmmyvb7d2000801qbci7mle0c	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmmyvhcb5000b01qb1l6xf0r0	Wesley Alves Caetano	5511945387441	wesley.alvescaetano@gmail.com	Gean Cardoso	2026-03-20 12:25:48.688	cmmy9t8m80000mykwoqn6jfu3	cmmyvhcb1000a01qb6qy8ko1y	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmmywaxu4000e01qbytubqrrg	Raphael Britto da Silva	5535991033812	raphaelmg9@hotmail.com	Gean Cardoso	2026-03-20 12:48:49.611	cmmy9t8m80000mykwoqn6jfu3	cmmxfdbk5000001o5pangol1w	cmmywaxu1000d01qbgaicye1e	cmmy9t8m80000mykwoqn6jfu3
cmmywseut000h01qbghhyhzy3	José Carlos araujo leite	5513988536918	marcenariavit3@gmaul.com	Gean Cardoso	2026-03-20 13:02:24.82	cmmy9t8m80000mykwoqn6jfu3	cmmywseuo000f01qb65rovgyn	cmmywseuq000g01qbmrnddsak	cmmy9t8m80000mykwoqn6jfu3
cmmyyz0jm000i01qb40r7lqam	Ernandes José da Silva	55912304548	ernandesjose8820@gmail.com	Gean Cardoso	2026-03-20 14:03:32.097	cmmy9t8m80000mykwoqn6jfu3	cmmxfdbk5000001o5pangol1w	cmmywaxu1000d01qbgaicye1e	cmmy9t8m80000mykwoqn6jfu3
cmmz1q5h3000k01qbmzjrmuq4	Gisele Veríssimo	5511972507147	verissimogisele22@gmail.com	Erisvaldo Veríssimo	2026-03-20 15:20:37.43	cmmwsh0rw000001ph1y4vmk71	cmmz1q5gz000j01qbuku2isi7	cmmww6vlo000201pd2wa07frc	cmmwsh0rw000001ph1y4vmk71
cmmz4nwbg000m01qb5vlvbiex	Silvana Souza Cardoso	5513981925260	vana-31@live.com	Gean Cardoso	2026-03-20 16:42:51.093	cmmy9t8m80000mykwoqn6jfu3	cmmz4nway000l01qbqe378sfw	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmmz8kje9000q01qbamm23oe8	Rodrigo Buffo	5511973370706	rbbissaco@gmail.com	Erisvaldo Veríssimo	2026-03-20 18:32:12.848	cmmwsh0rw000001ph1y4vmk71	cmmz8kje5000p01qbjxcymirh	cmmww6vlo000201pd2wa07frc	cmmwsh0rw000001ph1y4vmk71
cmmzcdkw9000s01qb4ndus17f	Renato Croccetti	5511957040685	croccettir@gmail.com	Erisvaldo Veríssimo	2026-03-20 20:18:46.664	cmmwsh0rw000001ph1y4vmk71	cmmzcdkw3000r01qb0d27ng28	cmmww6vlo000201pd2wa07frc	cmmwsh0rw000001ph1y4vmk71
cmmzd8883000u01qbqp10gzkr	Gil Vagner Pereira de Souza	5511970202035	gilvagneribi@gmail.com	Erisvaldo Veríssimo	2026-03-20 20:42:36.577	cmmwsh0rw000001ph1y4vmk71	cmmzd887u000t01qbm81msn1x	cmmww6vlo000201pd2wa07frc	cmmwsh0rw000001ph1y4vmk71
cmmzelvqf000x01qbxbsojd1x	Carlos Eduardo da S. Braga	5511937374886	\N	Erisvaldo Veríssimo	2026-03-20 21:21:13.189	cmmwsh0rw000001ph1y4vmk71	cmmzcdkw3000r01qb0d27ng28	cmmzelvjl000w01qb0fjj4d3t	cmmwsh0rw000001ph1y4vmk71
cmmzf4sdm001001qbp7iehewd	Oproprio	551199620055	gru01@icloud.com	Erisvaldo Veríssimo	2026-03-20 21:35:55.306	cmmwsh0rw000001ph1y4vmk71	cmmzf4sdj000z01qb21o6a3y6	cmmww6vlo000201pd2wa07frc	cmmwsh0rw000001ph1y4vmk71
cmmzkjk81001501qbmezp18oa	Sirço Lopes Dias	5519988139848	grandevigilia@hotmail.com	Adeildo - Hortolandia	2026-03-21 00:07:22.657	cmmzifhxj001201qbh5ra6tkb	cmmzkjk7s001301qbdjg5asmz	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmmzkjmny001801qbg63h6fgm	Rocha	5519999440099	rochamarivaldo875@gmail.com	Adeildo - Hortolandia	2026-03-21 00:07:25.821	cmmzifhxj001201qbh5ra6tkb	cmmzkjmnp001601qbo7hpuw78	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmmzkpme1001a01qbe7qraxxx	Marlene Silva Araújo de Oliveira	5519992671682	oliveiramarlene544@gmail.com	Adeildo - Hortolandia	2026-03-21 00:12:05.401	cmmzifhxj001201qbh5ra6tkb	cmmzkpmdy001901qbsv8h8pah	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmmzksl8o001c01qbv58mvmvf	Wallace Benites	5519994292947	beniteswallace@gmail.com	Adeildo - Hortolandia	2026-03-21 00:14:23.877	cmmzifhxj001201qbh5ra6tkb	cmmzksl8j001b01qbbffva6ks	cmmzelvjl000w01qb0fjj4d3t	cmmzifhxj001201qbh5ra6tkb
cmmzkwc8u001e01qb8rt7gt62	Clarice Alves Dias Ribeiro	5519982754925	claricebanho.alves.dias@gmail.com	Adeildo - Hortolandia	2026-03-21 00:17:18.846	cmmzifhxj001201qbh5ra6tkb	cmmzkwc8o001d01qb64oe59iq	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmmzl1peh001f01qboiki7bup	Clarice Alves Dias Ribeiro	5519982754925	claricebanho.alves.dias@gmail.com	Adeildo - Hortolandia	2026-03-21 00:21:29.176	cmmzifhxj001201qbh5ra6tkb	cmmxfdbk5000001o5pangol1w	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmmzl2y3k001g01qbkvryuze6	Janaina Barbosa	5519984243450	janainabarbosa4filhos@gmail.com	Adeildo - Hortolandia	2026-03-21 00:22:27.102	cmmzifhxj001201qbh5ra6tkb	cmmzkjmnp001601qbo7hpuw78	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmmzla11u001j01qbs5j5blhs	Adenilson Rodrigues	5519992689985	ad_pastor@outlook.com	Adeildo - Hortolandia	2026-03-21 00:27:57.521	cmmzifhxj001201qbh5ra6tkb	cmmzla11o001h01qbatpvwlpl	cmmzla11r001i01qb6kmgig2q	cmmzifhxj001201qbh5ra6tkb
cmmzlkwhl001l01qbna1jhm80	Andreia Santos da Costa	5519991564108	andreiasantos183544@gmail.com	Adeildo - Hortolandia	2026-03-21 00:36:24.825	cmmzifhxj001201qbh5ra6tkb	cmmzlkwhh001k01qbhr0h8f8o	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmmzltz0u001n01qbw6o137qm	Alexandra Silva Sato	5519999158405	alexandra.silva.sato17@gmail.com	Adeildo - Hortolandia	2026-03-21 00:43:28.014	cmmzifhxj001201qbh5ra6tkb	cmmzltz0r001m01qb9skag3xh	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmmzmqfy4001o01qbosun3mti	Jenefer Souza	5519974237016	jenefer.jeeh@gmail.com	Adeildo - Hortolandia	2026-03-21 01:08:42.94	cmmzifhxj001201qbh5ra6tkb	cmmzkwc8o001d01qb64oe59iq	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmmzn70m6001p01qbzt0fyk1g	Ruth cordeiro Pontes dos Santos	5519981893723	ruthpontes30@gmail.com	Adeildo - Hortolandia	2026-03-21 01:21:36.222	cmmzifhxj001201qbh5ra6tkb	cmmzkpmdy001901qbsv8h8pah	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmmznlgi3001r01qb4ooie627	Débora Cristina Bazílio Feliciano	5519981937672	cdebby891@gmail.comc	Adeildo - Hortolandia	2026-03-21 01:32:49.994	cmmzifhxj001201qbh5ra6tkb	cmmznlgi0001q01qbkh7ghr9m	cmmzelvjl000w01qb0fjj4d3t	cmmzifhxj001201qbh5ra6tkb
cmmzoquw4001t01qbozxf1oyo	Alex Nonato de Paula Jesus	5519982143908	alex.nonato.paula.jesus@gmail.com	Adeildo - Hortolandia	2026-03-21 02:05:01.538	cmmzifhxj001201qbh5ra6tkb	cmmzoquvs001s01qbvxplgm4g	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmmzp2hee001w01qba55gg9fk	Daniel Antônio Araújo	5519995733395	danielantonioaraujo399@gmail.com	Adeildo - Hortolandia	2026-03-21 02:14:03.925	cmmzifhxj001201qbh5ra6tkb	cmmzp2he9001u01qbi8gzbvlf	cmmzp2hec001v01qbj2krukao	cmmzifhxj001201qbh5ra6tkb
cmmzq03al001x01qbjyii0mf7	Alex Nonato de Paula Jesus	5519982143908	alex.nonato.paula.jesus@gmail.com	Adeildo - Hortolandia	2026-03-21 02:40:11.947	cmmzifhxj001201qbh5ra6tkb	cmmzkwc8o001d01qb64oe59iq	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmn093zlw001z01qbylxjfezs	Jefferson Almeida Ramos	5511954935154	supermercadodiaadiaeconomia@gmail.com	Gean Cardoso	2026-03-21 11:35:06.493	cmmy9t8m80000mykwoqn6jfu3	cmn093zla001y01qbeq6s136o	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmn0aktym002101qb04izhosq	Luciana Oliveira	5511961445501	lucianaaparecida.levita@gmail.com	Gean Cardoso	2026-03-21 12:16:11.947	cmmy9t8m80000mykwoqn6jfu3	cmn0aktye002001qb9z8am29n	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmn0b1gxx002301qbrwvxugzq	Jéssica Bianca da Silva Nascimento	5511987195056	pageueje@gmail.com	Diego Pageu - Osasco	2026-03-21 12:29:08.229	cmmz80a40000o01qbebxgvaej	cmn0b1gxt002201qbvowmb72f	cmmyv2yub000601qbfbtqn54v	cmmz80a40000o01qbebxgvaej
cmn0d8ebx002601qbjowsb122	Ezequiel Francisco dos Santos	5513974139695	ezequiel.guaruja@gmail.com	Gean Cardoso	2026-03-21 13:30:30.669	cmmy9t8m80000mykwoqn6jfu3	cmn0d8ebs002401qb389chfbj	cmn0d8ebv002501qbuqn4ungd	cmmy9t8m80000mykwoqn6jfu3
cmn0hefsc002901qbjyakp0j3	Givanilson dos Anjos Santos	5511966899579	artyseartys@hotmail.com	Gean Cardoso	2026-03-21 15:27:10.956	cmmy9t8m80000mykwoqn6jfu3	cmn0hefs9002801qbvt2cdws7	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmn0ho3bm002b01qbm8avi1c0	Márcio José Pereira	5511997248286	marcio.pereira.10.mp@gmail.com	Gean Cardoso	2026-03-21 15:34:41.361	cmmy9t8m80000mykwoqn6jfu3	cmn0ho3bj002a01qbzo86goz6	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmn0ivc2k002d01qbh17s6c0e	Manoel Andrade Alves	5513981020481	manoelandrade547@gmail.com	Gean Cardoso	2026-03-21 16:08:18.908	cmmy9t8m80000mykwoqn6jfu3	cmn0ivc2g002c01qbehsg4q9n	cmmywseuq000g01qbmrnddsak	cmmy9t8m80000mykwoqn6jfu3
cmn0jav26002e01qbt5zblro7	Alex Nonato de Paula Jesus	5519982143908	alex.nonato.paula.jesus@gmail.com	Adeildo - Hortolandia	2026-03-21 16:20:23.357	cmmzifhxj001201qbh5ra6tkb	cmmzoquvs001s01qbvxplgm4g	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmn0jh64h002f01qbn481hens	Alexandra Silva Sato	5519999158405	alexandra.sato17@gmail.com	Adeildo - Hortolandia	2026-03-21 16:25:17.633	cmmzifhxj001201qbh5ra6tkb	cmmzkwc8o001d01qb64oe59iq	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmn0kns8y002h01qbuut5sigm	Michele aparecida Meira dos santos	5513991992251	andersonmeira301@gmail.com	Pr. Anderson - Guarujá	2026-03-21 16:58:25.857	cmn0dkwpx002701qb162whxna	cmn0kns8s002g01qbrct407vl	cmn0d8ebv002501qbuqn4ungd	cmn0dkwpx002701qb162whxna
cmn0lzbeq002l01qbi1t9zumw	Gilmar Alves da Silva	5511947767650	gilsilva474747@gmail.com	Bispo Ivan / Guti	2026-03-21 17:35:23.521	cmn0lq20v002i01qbpsuojr53	cmn0lzbei002j01qb5n7fyc41	cmn0lzben002k01qb693g675o	cmn0lq20v002i01qbpsuojr53
cmn0n7z8u002n01qbiffv5qvd	Gleibice Feitosa da Silva	5514996769364	gleibece079@gmail.com	Bispo Ivan / Guti	2026-03-21 18:10:07.277	cmn0lq20v002i01qbpsuojr53	cmn0n7z8n002m01qbff5o0ct2	cmn0lzben002k01qb693g675o	cmn0lq20v002i01qbpsuojr53
cmn0n9d70002p01qb43a99p7h	JOSE LAUREANO	5511959359576	joselaureano1954@gmail.com	Bispo Ivan / Guti	2026-03-21 18:11:12.011	cmn0lq20v002i01qbpsuojr53	cmmzkwc8o001d01qb64oe59iq	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn0nqh6j002r01qbqdn3987s	Fábio Alexandre dos Santos	5511951441326	fabiobarbeiro321@gmail.com	Bispo Ivan / Guti	2026-03-21 18:24:30.33	cmn0lq20v002i01qbpsuojr53	cmn0nqh6g002q01qbexw8xni4	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn0nvr6q002t01qbsnwm7375	Marcelo Silva de Jesus	5511957537611	marcelocururu2@gmail.com	Bispo Ivan / Guti	2026-03-21 18:28:36.578	cmn0lq20v002i01qbpsuojr53	cmn0nvr6n002s01qbqq55bsqb	cmn0lzben002k01qb693g675o	cmn0lq20v002i01qbpsuojr53
cmn0nx019002v01qbl7hpfzra	Jayne Silva Bispo	5511962424010	jaynebispo234@gmail.com	Bispo Ivan / Guti	2026-03-21 18:29:34.701	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn0nyfm7002x01qb5nh9088k	Jennifer Kathleen da Silva Lucas	5511931438162	jenniferkathlenlucas@gmail.com	Bispo Ivan / Guti	2026-03-21 18:30:41.55	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn0lzben002k01qb693g675o	cmn0lq20v002i01qbpsuojr53
cmn0o0swf002z01qbrumtmcss	Jose Hélio Ferreira	5519998904418	jhelioferreira1@gmail.com	Adeildo - Hortolandia	2026-03-21 18:32:32.079	cmmzifhxj001201qbh5ra6tkb	cmn0o0sw9002y01qb8fbcjofz	cmmzp2hec001v01qbj2krukao	cmmzifhxj001201qbh5ra6tkb
cmn0o4xum003101qbdyq3ki7j	Beatriz Inoue	5511958397729	beatriz.inoue@hotmail.com	Bispo Ivan / Guti	2026-03-21 18:35:45.118	cmn0lq20v002i01qbpsuojr53	cmmzkwc8o001d01qb64oe59iq	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0o8b79003301qbmosw2n9s	Alzira pereira ballero de oliveira	5511989553594	alziraballero70vip@gmail.com	Bispo Ivan / Guti	2026-03-21 18:38:22.388	cmn0lq20v002i01qbpsuojr53	cmn0o8b75003201qbb86spngp	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0o96yx003501qbvq8h87am	Maria de Fátima Lima	5511977156639	fatinhamafa@gmail.com	Bispo Ivan / Guti	2026-03-21 18:39:03.56	cmn0lq20v002i01qbpsuojr53	cmn0o96yu003401qbvakmt5v7	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0oe1x1003701qbau1dyptf	Alzira pereira ballero de oliveira	5511989553594	alziraballero70vip@gmail.com	Bispo Ivan / Guti	2026-03-21 18:42:50.293	cmn0lq20v002i01qbpsuojr53	cmn0oe1wy003601qby5p9dacw	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0ol4ir003801qbd7duf2j5	Marcio Agostinho da Silva	5519981842468	marcio.agostinho1983@gmail.com	Adeildo - Hortolandia	2026-03-21 18:48:20.256	cmmzifhxj001201qbh5ra6tkb	cmmzkjmnp001601qbo7hpuw78	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmn0oqy9m003a01qbsz3cewzl	Marcos José Lisboa	5519982909077	marcoslisboajose@outlook.com	Adeildo - Hortolandia	2026-03-21 18:52:52.089	cmmzifhxj001201qbh5ra6tkb	cmn0oqy9i003901qbtitjgt1e	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmn0p7rma003c01qbbdyko54v	Camila de Amorim dos Santos	5519983564877	camylaadi.amorym@gmail.com	Adeildo - Hortolandia	2026-03-21 19:05:56.626	cmmzifhxj001201qbh5ra6tkb	cmn0p7rm5003b01qbe6fapkg2	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmn0pcood003e01qb5h7doujk	Marlene costa Nascimento	551197727015	costamarlene238@gmail.com	Bispo Ivan / Guti	2026-03-21 19:09:46.093	cmn0lq20v002i01qbpsuojr53	cmn0pcoob003d01qbeolk2y91	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn0pe8oq003f01qbojyjg7u4	Ana Paula Aparecida Bresio Silva	55014991255950	paulabresio2024@gmail.com	Bispo Ivan / Guti	2026-03-21 19:10:58.682	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0pgih1003h01qbz6cbuhad	Adriana Oliveira	5514998816222	adrianaoliveira070874@gmail.com	Bispo Ivan / Guti	2026-03-21 19:12:44.677	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn0pgigz003g01qb5y9tn8rz	cmn0lq20v002i01qbpsuojr53
cmn0phmtx003j01qb9cxj1i8y	Marlene costa Nascimento	5511977274015	costamarlene238@gmail.com	Bispo Ivan / Guti	2026-03-21 19:13:36.981	cmn0lq20v002i01qbpsuojr53	cmn0phmtu003i01qbz4ln247z	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn0pnmzs003l01qbkolhheof	Rosana Scalise Dos Santos	5514996172601	scalisantos@gmail.com	Bispo Ivan / Guti	2026-03-21 19:18:17.119	cmn0lq20v002i01qbpsuojr53	cmn0pnmzg003k01qb8pihgwuy	cmn0pgigz003g01qb5y9tn8rz	cmn0lq20v002i01qbpsuojr53
cmn0po3u3003n01qbdd59avbz	Ana Paula Aparecida Bresio Silva	55014991255950	paulabresio2024@gmail.com	Bispo Ivan / Guti	2026-03-21 19:18:38.955	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn0po3u1003m01qbn8sq4zaw	cmn0lq20v002i01qbpsuojr53
cmn0qjbp7003o01qbnzh67gh1	Daiane Renata Pires	5514997821832	daianerenata17@gmail.com	Bispo Ivan / Guti	2026-03-21 19:42:55.483	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn0po3u1003m01qbn8sq4zaw	cmn0lq20v002i01qbpsuojr53
cmn0qqwrs003q01qbdkd4i3tn	Ana Laura Scalabrin pedreira	5511945309458	anascalabrinlp@gmail.com	Bispo Ivan / Guti	2026-03-21 19:48:49.384	cmn0lq20v002i01qbpsuojr53	cmn0qqwrp003p01qbtpky2nhp	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0qwj5g003r01qb034x82i3	Roseli Soares do Carmo	5511951668048	rs.silva84@hotmail.com	Bispo Ivan / Guti	2026-03-21 19:53:11.668	cmn0lq20v002i01qbpsuojr53	cmn0phmtu003i01qbz4ln247z	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0sg33c003s01qblk1ies55	Rosana Moreira	5511960953791	rosanamoreira@ymail.com	Bispo Ivan / Guti	2026-03-21 20:36:23.592	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn0svydw003u01qbcn3osur2	Ester Rosa Arantes	5511950749887	esterrosadesaron44@gmail.com	Bispo Ivan / Guti	2026-03-21 20:48:43.988	cmn0lq20v002i01qbpsuojr53	cmn0svydt003t01qb9xx5eyq7	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0tremw003w01qb40h048ra	Tatiana Andrade	5511999659030	taticrisandrade@yahoo.com.br	Bispo Ivan / Guti	2026-03-21 21:13:11.384	cmn0lq20v002i01qbpsuojr53	cmn0trems003v01qblve9n66q	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn0wf651003z01qbo3syvn54	Luís Cláudio Teixeira Alves	5511954658194	luis01alves.santana@gmail.com	Bispo Ivan / Guti	2026-03-21 22:27:39.349	cmn0lq20v002i01qbpsuojr53	cmn0wf64x003x01qbt74ldnn0	cmn0wf650003y01qb5x4iwtos	cmn0lq20v002i01qbpsuojr53
cmn0wmxir004001qb3y4j1klb	Michelle Guimarães	5511995540643	guimaraespsi@hotmail.com	Bispo Ivan / Guti	2026-03-21 22:33:41.427	cmn0lq20v002i01qbpsuojr53	cmn0pcoob003d01qbeolk2y91	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn0z7ezh004101qbqk2f3ih1	Célia Maria Silva Alcântara Araújo	5511964617806	alcantara_2012.celia@hotmail.com	Bispo Ivan / Guti	2026-03-21 23:45:36.412	cmn0lq20v002i01qbpsuojr53	cmn0svydt003t01qb9xx5eyq7	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn0zkusw004301qbf1etuzyv	Robson Luis de Oliveira	5519992671682	robsonoliver74@hotmail.com	Adeildo - Hortolandia	2026-03-21 23:56:03.44	cmmzifhxj001201qbh5ra6tkb	cmn0zkust004201qb1d6ve9ep	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
cmn0zujmg004601qb48lfxw75	Vitor hugo	5513974250525	andersonmeira301@gmail.com	Pr. Anderson - Guarujá	2026-03-22 00:03:35.511	cmn0dkwpx002701qb162whxna	cmn0zujmb004401qbuhz7mq82	cmn0zujme004501qb57ncssnp	cmn0dkwpx002701qb162whxna
cmn11hboq004901qbsv8laq6q	Bruno Bello Ribas dos Santos (Reverendo Bruno Ribas)	5511964708274	reverendobrunoribas@yahoo.com.br	Gean Cardoso	2026-03-22 00:49:17.93	cmmy9t8m80000mykwoqn6jfu3	cmn11hbon004801qb5czj5fic	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmn136fy8004b01qbpv5lqfur	Sabrina Alexandrino Nascimento	5511932106845	sabrinasassa.2010@gmail.com	Bispo Ivan / Guti	2026-03-22 01:36:49.472	cmn0lq20v002i01qbpsuojr53	cmn136fy2004a01qb0bwzay5b	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn14nzap004d01qb0n3rws6n	Marisa Siqueira da Silva	5518988063715	branca.marisa@hotmail.com.br	Bispo Ivan / Guti	2026-03-22 02:18:27.312	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn14nzam004c01qbxec9pcr1	cmn0lq20v002i01qbpsuojr53
cmn16oekn004g01qbxq6x7fwv	Lisa marciele Bernardo verpa bruder	5514998824394	lisabernardo.2022@gmail.com	Bispo Ivan / Guti	2026-03-22 03:14:46.343	cmn0lq20v002i01qbpsuojr53	cmn16oeke004e01qbjkrf33tl	cmn16oeki004f01qbqu0s0lq8	cmn0lq20v002i01qbpsuojr53
cmn18aywh004j01qbs25n4mao	Thais Alessandra Santos souza	5517981162118	thais.rpamor33@gmail.com	Bispo Ivan / Guti	2026-03-22 04:00:18.737	cmn0lq20v002i01qbpsuojr53	cmn18aywd004h01qbdsdl5hn1	cmn18aywg004i01qbzcxrgv49	cmn0lq20v002i01qbpsuojr53
cmn1pfmpf004l01qb32sfki0e	Cristina Aoarecida Melo Moores	5541984097617	crismoores24@gmail.com	Bispo Ivan / Guti	2026-03-22 11:59:49.667	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn1pfmoj004k01qb8ytu9cp2	cmn0lq20v002i01qbpsuojr53
cmn1sy1ir004n01qb04teohso	Leia Alves Pereira dos Santos	5519981929946	leiaalvespereirasantos@gmail.com	Adeildo - Hortolandia	2026-03-22 13:38:07.538	cmmzifhxj001201qbh5ra6tkb	cmn1sy1im004m01qb9aejnb6v	cmmzkjk7x001401qbjdtt9sew	cmmzifhxj001201qbh5ra6tkb
cmn1t5xmd004p01qbv4erl3nt	Maria do Socorro Yoneda	5511977962736	socorrobless@gmail.com	Bispo Ivan / Guti	2026-03-22 13:44:15.733	cmn0lq20v002i01qbpsuojr53	cmn1t5xm8004o01qb5rolv708	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn1udpde004q01qbhinfacse	Raquel	5514998808252	aparecidaraquelrosa@gmail.com	Bispo Ivan / Guti	2026-03-22 14:18:17.905	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn16oeki004f01qbqu0s0lq8	cmn0lq20v002i01qbpsuojr53
cmn1valny004t01qbjhapshhu	Edi Carlos França	5519981639768	edicarloshortolandia2018@gmail.com	Adeildo - Hortolandia	2026-03-22 14:43:52.75	cmmzifhxj001201qbh5ra6tkb	cmn1valnu004r01qb4ctzb2ir	cmn1valnx004s01qbgm716a1a	cmmzifhxj001201qbh5ra6tkb
cmn1vms8v004u01qb4jwq1p9c	Antônio César	5511988001407	cesarlebon@icloud.com	Bispo Ivan / Guti	2026-03-22 14:53:21.15	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn1xdoc5004w01qbrb5e44j7	Leonardo Reis Pereira Pires	5511978382670	leonardoreispires26@gmail.com	Bispo Ivan / Guti	2026-03-22 15:42:15.412	cmn0lq20v002i01qbpsuojr53	cmn1xdoc0004v01qbaa6x54hr	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn1xtbd5004y01qbt993o80j	Clarice Domingues rodrigues	5511951446344	clarice_drodrigues@hotmail.com	Bispo Ivan / Guti	2026-03-22 15:54:25.097	cmn0lq20v002i01qbpsuojr53	cmn1xtbd2004x01qb2xxqttrm	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn1yt41w004z01qbl4qrbazw	Cleiston Vaz de Oliveira	5516997536408	cleistoon.vaz@gmail.com	Bispo Ivan / Guti	2026-03-22 16:22:15.235	cmn0lq20v002i01qbpsuojr53	cmmzkjmnp001601qbo7hpuw78	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn232uzn005101qbx0kr1tdh	Vanderlei  soares guimaraes	5511948366288	delei.soares01@gmail.com	Bispo Ivan / Guti	2026-03-22 18:21:48.513	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn232uzg005001qbe9le53s0	cmn0lq20v002i01qbpsuojr53
cmn236mes005201qb8d5pgip2	Eduarda moreira Gustavo	5511985359167	dudamoreirapessoal@gmail.com	Bispo Ivan / Guti	2026-03-22 18:24:44.02	cmn0lq20v002i01qbpsuojr53	cmn0svydt003t01qb9xx5eyq7	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn237r39005301qb44a3fud7	Vanderlei soares Guimarães	5511948366288	delei.soares01@gmail.com	Bispo Ivan / Guti	2026-03-22 18:25:36.738	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn232uzg005001qbe9le53s0	cmn0lq20v002i01qbpsuojr53
cmn23ni4e005501qblqs0fcmp	Jose jamerson Silva de almeida	5511978308107	jose_jamerson@outlook.com	Bispo Ivan / Guti	2026-03-22 18:37:51.613	cmn0lq20v002i01qbpsuojr53	cmn23ni4a005401qbuyqja3my	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn2426de005701qbajmxv5wm	Helio Carlos dos Santos	5511993327517	carlosantos5193@gmail.com	Gean Cardoso	2026-03-22 18:49:16.225	cmmy9t8m80000mykwoqn6jfu3	cmn2426d9005601qbeqzc9uuo	cmn0o4xuj003001qba6m3oo3e	cmmy9t8m80000mykwoqn6jfu3
cmn25epzi005801qbpdf5dk4f	Fábio Cavalcante	5511914360101	fabiopivomar@gmail.com	Gean Cardoso	2026-03-22 19:27:01.134	cmmy9t8m80000mykwoqn6jfu3	cmn0trems003v01qblve9n66q	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmn26le0n005a01qboxq4ocbw	Fábio Alexandre dos Santos	5511951441326	fabiobarbeiro321@gmail.com	Bispo Ivan / Guti	2026-03-22 20:00:11.83	cmn0lq20v002i01qbpsuojr53	cmn26le0h005901qbhwdsujbf	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn2adt2t005d01qb8y3gsssx	Muriel Araujo lima	5511959578186	murielaraujolima77@gmail.com	Bispo Ivan / Guti	2026-03-22 21:46:16.564	cmn0lq20v002i01qbpsuojr53	cmn2adt2o005b01qbf1es7mq6	cmn2adt2r005c01qbo4gfgumf	cmn0lq20v002i01qbpsuojr53
cmn2azdr1005f01qbkk92vngz	Ronaldo dos Santos theodoro	5511987690191	ronaldooficial91@gmail.com	Gean Cardoso	2026-03-22 22:03:03.132	cmmy9t8m80000mykwoqn6jfu3	cmn2azdqx005e01qb2ki5labp	cmmww6vlo000201pd2wa07frc	cmmy9t8m80000mykwoqn6jfu3
cmn2bfec9005h01qbsn6ziqj9	Janaina Domingos de Mattos Oliveira	5517991218905	janainadomingosdemattos@gmail.com	Bispo Ivan / Guti	2026-03-22 22:15:30.393	cmn0lq20v002i01qbpsuojr53	cmn0svydt003t01qb9xx5eyq7	cmn2bfec7005g01qbajiv9hw3	cmn0lq20v002i01qbpsuojr53
cmn2bgrf7005i01qbgv7snnsy	Adriano aparecido de Oliveira	5517996603199	janainadomingosdemattos@gmail.com	Bispo Ivan / Guti	2026-03-22 22:16:34.002	cmn0lq20v002i01qbpsuojr53	cmn0svydt003t01qb9xx5eyq7	cmn2bfec7005g01qbajiv9hw3	cmn0lq20v002i01qbpsuojr53
cmn2caid4005j01qbwak3a741	Valdirene Souza de Morais	5511987630476	valdirenesouzamorais@gmail.com	Bispo Ivan / Guti	2026-03-22 22:39:41.944	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn2cbppq005l01qbprdvjeti	Ivanete Rosa de Almeida	5511913527120	i.vanete-nete@hotmail.com	Bispo Ivan / Guti	2026-03-22 22:40:38.125	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn2g01p8000601och0vcgc4o	Sandra isabel dos Santos	5511965550647	sandraisabel@gmail.com	Bispo Ivan / Guti	2026-03-23 00:23:32.252	cmn0lq20v002i01qbpsuojr53	cmn2g01p3000401oc83h39u1v	cmn2g01p6000501ochcy3imjf	cmn0lq20v002i01qbpsuojr53
cmn2im0u4000101oilwf6j3tb	Gidelvania Ferreira da Silva	5511978031160	wania.10m@gmail.com	Bispo Ivan / Guti	2026-03-23 01:36:36.795	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn2kux71000101p9yzfoblcx	José Anderson da Silva	5511958582991	prandersonoliveira30@gmail.com	Bispo Ivan / Guti	2026-03-23 02:39:31.196	cmn0lq20v002i01qbpsuojr53	cmn2kux4w000001p9amuebq5u	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn2l227y000301oaquj99n0q	Wagner Durval	5514998035854	wagnerdurvalcruz@gmail.com	Bispo Ivan / Guti	2026-03-23 02:45:04.317	cmn0lq20v002i01qbpsuojr53	cmn2l227h000101oazt5ssso9	cmn2l227r000201oa15let7zz	cmn0lq20v002i01qbpsuojr53
cmn2m0i96000401px51t1wm9x	Messias Rafael Valadares De Oliveira	5582994339708	oraphael575@gmail.com	Bispo Ivan / Guti	2026-03-23 03:11:51.401	cmn0lq20v002i01qbpsuojr53	cmn2m0i91000301px695ul1g2	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn2mnx0w000601pxaou6qqg8	Jeanny Muniz	5511998348313	jeannymuniz@gmail.com	Bispo Ivan / Guti	2026-03-23 03:30:03.631	cmn0lq20v002i01qbpsuojr53	cmn2mnx0s000501px5sjg9pzw	cmn2g01p6000501ochcy3imjf	cmn0lq20v002i01qbpsuojr53
cmn2mrl1z000901px8q3p6m47	Nayara Silva	5511976944472	naysilva@gmail.com	Bispo Ivan / Guti	2026-03-23 03:32:54.743	cmn0lq20v002i01qbpsuojr53	cmn2mrl1u000701pxd3v32j0l	cmn2mrl1x000801pxpfrdx50q	cmn0lq20v002i01qbpsuojr53
cmn2mvast000a01px3ijzsrm9	Isadora Machado de Castro	5511974463700	isadoramachadcastro@gmail.com	Bispo Ivan / Guti	2026-03-23 03:35:48.077	cmn0lq20v002i01qbpsuojr53	cmmzkwc8o001d01qb64oe59iq	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn2zu695000b01pxlc2w341t	Eris	5511986353214	eris@eris.com	Erisvaldo Veríssimo	2026-03-23 09:38:50.531	cmmwsh0rw000001ph1y4vmk71	cmmzkjmnp001601qbo7hpuw78	cmn14nzam004c01qbxec9pcr1	cmmwsh0rw000001ph1y4vmk71
cmn3cdad3000d01pxb9rp5to4	Maria Betânia Bispo	5511977914082	betaniabispo53@gmail.com	Bispo Ivan / Guti	2026-03-23 15:29:37.717	cmn0lq20v002i01qbpsuojr53	cmn3cdacp000c01px4diud1t2	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn3cwtz1000e01pxz6gg3y5t	José de Souza	5511972310811	zepretosouzaze@gmail.com	Bispo Ivan / Guti	2026-03-23 15:44:49.596	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn3d2k1o000g01px70wxkeb1	Jaizer Andre Domingos	5516993477628	jaizejaizer@gmail.com	Bispo Ivan / Guti	2026-03-23 15:49:16.668	cmn0lq20v002i01qbpsuojr53	cmn2fxgcw000101ocgmncvaku	cmn3d2k1l000f01pxm15limem	cmn0lq20v002i01qbpsuojr53
cmn3dnfbf000h01pxb11f7z20	Marinalva Conceição Pereira Souza	5511992165148	zepretosouzaze@gmail.com	Bispo Ivan / Guti	2026-03-23 16:05:30.315	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn3e1bit000i01pxqp44eunk	Ivaneide Gustavo	5511964512363	ivaneidegustavo887@gmail.com	Bispo Ivan / Guti	2026-03-23 16:16:18.581	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3e50yu000k01pxduzdhsqu	Sonia Regina Scalabrin	5511937518417	ruiva.cruz@gmail.com	Bispo Ivan / Guti	2026-03-23 16:19:11.525	cmn0lq20v002i01qbpsuojr53	cmn3e50yo000j01px0ukfje71	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn3eas4k000m01px0414j7zl	Davison correia dias	5511945684342	dias124343@gmail.com	Bispo Ivan / Guti	2026-03-23 16:23:40.004	cmn0lq20v002i01qbpsuojr53	cmn3eas4g000l01px6evbgjqn	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn3eg2lq000n01pxxwat41tw	Davison correia dias	5511945684342	dias124343@gmail.com	Bispo Ivan / Guti	2026-03-23 16:27:46.861	cmn0lq20v002i01qbpsuojr53	cmn3eas4g000l01px6evbgjqn	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn3el73j000o01pxgftjy0vn	Natali Bezerra de santana	5511993691996	natali.bezerra82@gmail.com	Bispo Ivan / Guti	2026-03-23 16:31:45.966	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn2g01p6000501ochcy3imjf	cmn0lq20v002i01qbpsuojr53
cmn3emcq6000p01pxnb4ynxk2	Cleiton Luís de Paula	5527992379234	cleitonpaula672@gmail.com	Bispo Ivan / Guti	2026-03-23 16:32:39.917	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn2g01p6000501ochcy3imjf	cmn0lq20v002i01qbpsuojr53
cmn3enj8p000r01px9ptjdr2l	Luzinete Bezerra da silva	5511977245010	luzinete.bs@hotmail.com	Bispo Ivan / Guti	2026-03-23 16:33:35.016	cmn0lq20v002i01qbpsuojr53	cmn3enj8m000q01pxicntoa1h	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3eocud000s01pxz9n688a0	Vanessa Rodrigues Pastre Sbravatti	5517991802277	vane.sbravatti24@gmail.com	Bispo Ivan / Guti	2026-03-23 16:34:13.378	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn0lzben002k01qb693g675o	cmn0lq20v002i01qbpsuojr53
cmn3eouew000t01px7nkdpzxx	Natania Bezerra de Santana	5511987622239	tania.santana@gmail.com	Bispo Ivan / Guti	2026-03-23 16:34:36.151	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3ert4j000u01pxmz32r529	Jonathas Bezerra de Santana	5511966330448	jhony1905@gmail.com	Bispo Ivan / Guti	2026-03-23 16:36:54.45	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3erypp000w01px8yvcjp2j	Carlos Eduardo Sbravatti	5517991571724	vane_sbravatti@hotmail.com	Bispo Ivan / Guti	2026-03-23 16:37:01.693	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn3erypn000v01px1xwmrt90	cmn0lq20v002i01qbpsuojr53
cmn3esnx5000z01pxvtybh3m4	José Carlos Aquilar filho	5592991331279	carlosaquilar2@gmail.com	Bispo Ivan / Guti	2026-03-23 16:37:34.361	cmn0lq20v002i01qbpsuojr53	cmn3esnx0000x01pxihhappks	cmn3esnx3000y01px2oiyxf1e	cmn0lq20v002i01qbpsuojr53
cmn3et3ay001001pxjlugj4ea	Terezinha de Queiroz	5511991421766	tekaqueiroz@gmail.com	Bispo Ivan / Guti	2026-03-23 16:37:54.298	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3exfli001101pxmrsmbnr8	Jennifer Kathlen da Silva Lucas	5511931438162	jenniferkathlenlucas@gmail.com	Bispo Ivan / Guti	2026-03-23 16:41:16.854	cmn0lq20v002i01qbpsuojr53	cmn0nyfm3002w01qbqru9i328	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3f6jpk001301pxqg3orib8	Paulo Sérgio Sousa dos Santos	5511948917744	paulodesousarj@gmail.com	Bispo Ivan / Guti	2026-03-23 16:48:22.088	cmn0lq20v002i01qbpsuojr53	cmn3f6jph001201pxs6xtnyav	cmn0n9d6x002o01qbo2u730yv	cmn0lq20v002i01qbpsuojr53
cmn3fbs3y001501pxd9kbxgb5	Tiago Mosquete	5518996826255	prtiagocosta@hotmail.com	Bispo Ivan / Guti	2026-03-23 16:52:26.254	cmn0lq20v002i01qbpsuojr53	cmn2adt2o005b01qbf1es7mq6	cmn3fbs3w001401pxchkt8we6	cmn0lq20v002i01qbpsuojr53
cmn3fe58y001701pxffvpqmgl	Fábio Alexandre dos Santos	5511951441326	fabiobarbeiro321@gmail.com	Bispo Ivan / Guti	2026-03-23 16:54:16.594	cmn0lq20v002i01qbpsuojr53	cmn3fe58u001601pxekm7mnwe	cmmww6vlo000201pd2wa07frc	cmn0lq20v002i01qbpsuojr53
cmn3fill3001801pxaym38cuj	Elaine Cristina da Silva Guimarães	5516988553207	elainegui2012@gmail.com	Bispo Ivan / Guti	2026-03-23 16:57:44.39	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn3d2k1l000f01pxm15limem	cmn0lq20v002i01qbpsuojr53
cmn3ghzg0001901pxviajzxkw	Sérgio Messias do Nascimento	5511968335858	messiassergio90@gmail.com	Bispo Ivan / Guti	2026-03-23 17:25:15.311	cmn0lq20v002i01qbpsuojr53	cmn0trems003v01qblve9n66q	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3gz6iu001a01pxmc0bthzh	Ester  Rosa Arantes	5511950749887	esterrosadesaron44@gmail.com	Bispo Ivan / Guti	2026-03-23 17:38:37.638	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3ho92s001b01pxrao05m2q	Débora Cristina da Silva	5517981141222	deboracristinatnb2019@gmail.com	Bispo Ivan / Guti	2026-03-23 17:58:07.348	cmn0lq20v002i01qbpsuojr53	cmn0pcoob003d01qbeolk2y91	cmn2bfec7005g01qbajiv9hw3	cmn0lq20v002i01qbpsuojr53
cmn3i7x6d001d01pxgzcjq7e7	Deidiane rocha gimenes	5516994542246	amarula97@gmail.com	Bispo Ivan / Guti	2026-03-23 18:13:25.044	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn3i7x69001c01pxt2ibnyv8	cmn0lq20v002i01qbpsuojr53
cmn3ids2q001e01px8wks1aiw	Keila de Fátima da Silva	5516991231930	keilasilvaserrana380@gmail.com	Bispo Ivan / Guti	2026-03-23 18:17:58.37	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn3i7x69001c01pxt2ibnyv8	cmn0lq20v002i01qbpsuojr53
cmn3jnrbw001h01pxreu1fpvm	Lucimara de Jesus silvestre Amorim	5518996168846	lucimaradejesus2701@gmail.com	Bispo Ivan / Guti	2026-03-23 18:53:43.579	cmn0lq20v002i01qbpsuojr53	cmn3jnrbr001f01pxhe78ue3o	cmn3jnrbu001g01pxf4je5on6	cmn0lq20v002i01qbpsuojr53
cmn3kfp72001i01px74q5hx22	Priscila Correa de Araújo	5516992705768	araujopricor@gmail.com	Bispo Ivan / Guti	2026-03-23 19:15:27.182	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn3i7x69001c01pxt2ibnyv8	cmn0lq20v002i01qbpsuojr53
cmn3lflor001j01px0tsrbm5w	Jairo Araújo Nepomuceno	5511980119374	jairoaraujo0800@gmail.com	Bispo Ivan / Guti	2026-03-23 19:43:22.25	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3n72tf001l01pxvdorr409	Claudenir de Aquino Bezerra	5511974896697	gilgomeskm409@gmail.com	Bispo Ivan / Guti	2026-03-23 20:32:43.778	cmn0lq20v002i01qbpsuojr53	cmn0zkust004201qb1d6ve9ep	cmn3n72tc001k01px6igxtl1e	cmn0lq20v002i01qbpsuojr53
cmn3nal93001n01px2asxsgym	Jefferson Marques soares moreira	5511940027360	marques.jefferson000@gmail.com	Wesley Caetano	2026-03-23 20:35:27.639	cmn10x7qz004701qby3q83916	cmn3nal8z001m01pxpt39mxug	cmmww6vlo000201pd2wa07frc	cmn10x7qz004701qby3q83916
cmn3nchmi001o01pxknv8qx3d	Eline Cristiane Matias	5511947924162	marques.jefferson.000@gmail.com	Wesley Caetano	2026-03-23 20:36:56.25	cmn10x7qz004701qby3q83916	cmn0nvr6n002s01qbqq55bsqb	cmmww6vlo000201pd2wa07frc	cmn10x7qz004701qby3q83916
cmn3orl7g001p01px7nhnhz0z	Stephanie Carolini Sbravatti	5517992050352	sbravatti.stephanie@gmail.com	Bispo Ivan / Guti	2026-03-23 21:16:40.347	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn3erypn000v01px1xwmrt90	cmn0lq20v002i01qbpsuojr53
cmn3ov59t001q01pxikvz9qz5	Sophia Eduarda Sbravatti	5517992417836	sophia.sbravatti@gmail.com	Bispo Ivan / Guti	2026-03-23 21:19:26.32	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn3erypn000v01px1xwmrt90	cmn0lq20v002i01qbpsuojr53
cmn3owiwm001r01px4634rl5t	Zilda Rodrigues Pastre	5517992717052	zilda.pastre@gmail.com	Bispo Ivan / Guti	2026-03-23 21:20:30.645	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn3erypn000v01px1xwmrt90	cmn0lq20v002i01qbpsuojr53
cmn3oxf8y001s01pxuclqw5ez	José Pastre	5517992157022	jose.pastre@gmail.com	Bispo Ivan / Guti	2026-03-23 21:21:12.562	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn3erypn000v01px1xwmrt90	cmn0lq20v002i01qbpsuojr53
cmn3oz0uj001t01pxfiowjnvr	Vanessa Rodrigues Pastre Sbravatti	5517991802277	vane.sbravatti24@gmail.com	Bispo Ivan / Guti	2026-03-23 21:22:27.211	cmn0lq20v002i01qbpsuojr53	cmn2cbppm005k01qb6bknvj6f	cmn3erypn000v01px1xwmrt90	cmn0lq20v002i01qbpsuojr53
cmn3q058h001u01px6vl06xj7	Marina Rodrigues da Silva Batista	5511985911061	mahrina_@hotmail.com	Bispo Ivan / Guti	2026-03-23 21:51:19.169	cmn0lq20v002i01qbpsuojr53	cmn0svydt003t01qb9xx5eyq7	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3q14rr001w01pxme15ao7y	Marina Rodrigues	5511985911061	mahrina@hotmail.com	Bispo Ivan / Guti	2026-03-23 21:52:05.221	cmn0lq20v002i01qbpsuojr53	cmn3q14rl001v01pxq12p7rnv	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3q2vc6001y01pxdg35xms2	Márcia Vivaldini	5517933002670	mvivaldinni@gmail.com	Bispo Ivan / Guti	2026-03-23 21:53:26.31	cmn0lq20v002i01qbpsuojr53	cmn3q2vc2001x01pxrdx1o3nh	cmn3erypn000v01px1xwmrt90	cmn0lq20v002i01qbpsuojr53
cmn3qu3pw001z01pxy10l5vsz	Marina Rodrígues e	5511905911061	mahrina@hotmail.com	Bispo Ivan / Guti	2026-03-23 22:14:36.884	cmn0lq20v002i01qbpsuojr53	cmn3q14rl001v01pxq12p7rnv	cmn0o4xuj003001qba6m3oo3e	cmn0lq20v002i01qbpsuojr53
cmn3rduep002101pxuxcr8c6s	Aparecida Rodrigues Amorim	5518998231007	lucimaradejesus2701@gmail.com	Bispo Ivan / Guti	2026-03-23 22:29:57.936	cmn0lq20v002i01qbpsuojr53	cmn3rduel002001pxj1coum19	cmn3jnrbu001g01pxf4je5on6	cmn0lq20v002i01qbpsuojr53
cmn3ru7ev002301pxwqfhgeew	Geraldo Francisco da Silva	5511980371262	geraldofrancisco15@gmail.com	Bispo Ivan / Guti	2026-03-23 22:42:41.285	cmn0lq20v002i01qbpsuojr53	cmn3ru7ep002201px9yo6f8mx	cmn3n72tc001k01px6igxtl1e	cmn0lq20v002i01qbpsuojr53
cmn3vfhfk002401px7jn2f3dm	Fabiano da silva Guimarães	5516991041528	fabianosilvaguimaraes22@gmail.com	Bispo Ivan / Guti	2026-03-24 00:23:12.892	cmn0lq20v002i01qbpsuojr53	cmn0nx015002u01qbguwsba27	cmn3d2k1l000f01pxm15limem	cmn0lq20v002i01qbpsuojr53
cmn3ycf4h002601pxqoxdx9fs	Ana Paula DALTRO Figueiredo	5519988110197	pdaltro.f@gmail.com	Adeildo - Hortolandia	2026-03-24 01:44:48.784	cmmzifhxj001201qbh5ra6tkb	cmn3ycf49002501pxxyyatn0m	cmmzkjmnv001701qb9k6zee10	cmmzifhxj001201qbh5ra6tkb
\.


--
-- Data for Name: municipalities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.municipalities (id, name, state_code, created_at) FROM stdin;
cmmww6vlo000201pd2wa07frc	Guarulhos	SP	2026-03-19 03:10:07.74
cmmy98a4n000301qbijyi5reb	Gasdasd	SP	2026-03-20 02:02:54.407
cmmyv2yub000601qbfbtqn54v	Osasco	SP	2026-03-20 12:14:38.05
cmmywaxu1000d01qbgaicye1e	Atibaia	SP	2026-03-20 12:48:49.609
cmmywseuq000g01qbmrnddsak	Praia grande	SP	2026-03-20 13:02:24.818
cmmzelvjl000w01qb0fjj4d3t	Campinas	SP	2026-03-20 21:21:12.945
cmmzkjk7x001401qbjdtt9sew	Hortolândia	SP	2026-03-21 00:07:22.653
cmmzkjmnv001701qb9k6zee10	Hortolandia	SP	2026-03-21 00:07:25.819
cmmzla11r001i01qb6kmgig2q	Paulinia SP	SP	2026-03-21 00:27:57.519
cmmzp2hec001v01qbj2krukao	Sumaré	SP	2026-03-21 02:14:03.924
cmn0d8ebv002501qbuqn4ungd	Guaruja	SP	2026-03-21 13:30:30.667
cmn0lzben002k01qb693g675o	Sp	SP	2026-03-21 17:35:23.518
cmn0n9d6x002o01qbo2u730yv	São Paulo	SP	2026-03-21 18:11:12.009
cmn0o4xuj003001qba6m3oo3e	Sao Paulo	SP	2026-03-21 18:35:45.115
cmn0pgigz003g01qb5y9tn8rz	ITATINGA SP	SP	2026-03-21 19:12:44.675
cmn0po3u1003m01qbn8sq4zaw	Itatinga	SP	2026-03-21 19:18:38.953
cmn0wf650003y01qb5x4iwtos	Vargem Grande Paulista	SP	2026-03-21 22:27:39.347
cmn0zujme004501qb57ncssnp	Guarujá	SP	2026-03-22 00:03:35.51
cmn14nzam004c01qbxec9pcr1	Araçatuba	SP	2026-03-22 02:18:27.31
cmn16oeki004f01qbqu0s0lq8	Botucatu	SP	2026-03-22 03:14:46.338
cmn18aywg004i01qbzcxrgv49	São José do Rio Preto	SP	2026-03-22 04:00:18.736
cmn1pfmoj004k01qb8ytu9cp2	Matao SP	SP	2026-03-22 11:59:49.65
cmn1valnx004s01qbgm716a1a	Hortolândia Sp	SP	2026-03-22 14:43:52.749
cmn232uzg005001qbe9le53s0	Itaquaquacetuba	SP	2026-03-22 18:21:48.508
cmn2adt2r005c01qbo4gfgumf	Cajati	SP	2026-03-22 21:46:16.563
cmn2bfec7005g01qbajiv9hw3	Tanabi	SP	2026-03-22 22:15:30.391
cmn2g01p6000501ochcy3imjf	Francisco Morato	SP	2026-03-23 00:23:32.25
cmn2kxxsr000401p96ql9e7i7	Gwgq	SP	2026-03-23 02:41:51.963
cmn2l227r000201oa15let7zz	Marilia	SP	2026-03-23 02:45:04.311
cmn2lhczq000201jyhm3ufvf8	yasghda	SP	2026-03-23 02:56:58.118
cmn2lxzq6000101px3q2ao9i7	dsfsgf	SP	2026-03-23 03:09:54.078
cmn2mrl1x000801pxpfrdx50q	Franco da Rocha	SP	2026-03-23 03:32:54.741
cmn3d2k1l000f01pxm15limem	Serrana SP	SP	2026-03-23 15:49:16.665
cmn3erypn000v01px1xwmrt90	Catanduva	SP	2026-03-23 16:37:01.691
cmn3esnx3000y01px2oiyxf1e	Itapevi	SP	2026-03-23 16:37:34.359
cmn3fbs3w001401pxchkt8we6	Birigui	SP	2026-03-23 16:52:26.252
cmn3i7x69001c01pxt2ibnyv8	Serrana	SP	2026-03-23 18:13:25.041
cmn3jnrbu001g01pxf4je5on6	Assis	SP	2026-03-23 18:53:43.578
cmn3n72tc001k01px6igxtl1e	Itaquaquecetuba	SP	2026-03-23 20:32:43.776
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, role, created_at, devzapp_link, name, indicated_by_user_id) FROM stdin;
cmmwsh0rw000001ph1y4vmk71	erisvaldoverissimo1978@gmail.com	$2a$10$5Az1kHF4XgdLOzU.t/LfseT3U3PZUZll83rqGVxMk5K.uSmuCYDH.	COORDENADOR	2026-03-19 01:26:02.54	\N	Erisvaldo Veríssimo	\N
cmmy9t8m80000mykwoqn6jfu3	geangleison@hotmail.com	$2a$10$i0JoiWbFVv5pBP6VXhv6UO3Y8VWGdaPgMKETCCK.XelEauFUhoGLu	COORDENADOR	2026-03-20 02:19:12.224	\N	Gean Cardoso	\N
cmmz6uxce000n01qbmbbtkv84	jjoaocaetanojc@gmail.com	$2a$10$3a8fB6ciyDsWRO4Gr7lzIeI4ST39MHMQ74fh2/AzERqNXuMW9L/Su	LIDER_REGIONAL	2026-03-20 17:44:18.24	\N	João Caetano	cmmwsh0rw000001ph1y4vmk71
cmmz80a40000o01qbebxgvaej	diegopageudonascimento@gmail.com	$2a$10$8wp9PW8FHcpmsrzbcQ8sf.QMS4bFzUs5oY2NA23ewG7KG2Hx1D1Lu	LIDER_REGIONAL	2026-03-20 18:16:27.686	\N	Diego Pageu - Osasco	cmmwsh0rw000001ph1y4vmk71
cmmzfyep9001101qbmy36t8aj	jacquexsoares@gmail.com	$2a$10$PyWay9iioFtnwAL3adD.jOwxduxXp/U05L0xcxxQp0PkyH79OlnP6	LIDER_REGIONAL	2026-03-20 21:58:57.253	\N	Bispo Jacques-ZN	cmmy9t8m80000mykwoqn6jfu3
cmmzifhxj001201qbh5ra6tkb	arpublicita@gmail.com	$2a$10$.T8uIC6DDUlmCAAc3Cn1.etEKyzzsKOiyJnpBXKqJn8Woaa6lHMoq	LIDER_REGIONAL	2026-03-20 23:08:13.821	\N	Adeildo - Hortolandia	cmmy9t8m80000mykwoqn6jfu3
cmn0dkwpx002701qb162whxna	andersonmeira301@gmail.com	$2a$10$DUHE8ZLY3yAmqz7yf9n2TuNG7hisS2QNUdTWwh8yOqhPDZYwB317C	LIDER_REGIONAL	2026-03-21 13:40:14.362	\N	Pr. Anderson - Guarujá	cmmy9t8m80000mykwoqn6jfu3
cmn0lq20v002i01qbpsuojr53	pastorivanplenitude@gmail.com	$2a$10$wo4n4AWlePnBrnNa/TmFIeCdVq5osNraN49rfbXMLCmKyv6Tkl4n.	LIDER_REGIONAL	2026-03-21 17:28:11.446	\N	Bispo Ivan / Guti	cmmy9t8m80000mykwoqn6jfu3
cmn10x7qz004701qby3q83916	wesley.alvescaetano@gmail.com	$2a$10$WmphnhPwLMNezdfBzQvf/O5j/u0d8AtGG6FBXOOVu9PMuRZUTWyYK	LIDER_REGIONAL	2026-03-22 00:33:39.698	\N	Wesley Caetano	cmmy9t8m80000mykwoqn6jfu3
cmmwlmqmh00002yl92xt94n07	admin@guti.com	$2a$10$SM8kQRqfeT2ZXjrqpYEIzuwfCTOpwPIQYrmr7g0mtF/rwnIxohOWS	COORDENADOR	2026-03-18 22:14:32.008	\N	\N	\N
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);


--
-- Name: churches churches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.churches
    ADD CONSTRAINT churches_pkey PRIMARY KEY (id);


--
-- Name: indications indications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indications
    ADD CONSTRAINT indications_pkey PRIMARY KEY (id);


--
-- Name: municipalities municipalities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.municipalities
    ADD CONSTRAINT municipalities_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: churches_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX churches_name_key ON public.churches USING btree (name);


--
-- Name: indications_church_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX indications_church_id_idx ON public.indications USING btree (church_id);


--
-- Name: indications_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX indications_created_at_idx ON public.indications USING btree (created_at);


--
-- Name: indications_created_by_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX indications_created_by_id_idx ON public.indications USING btree (created_by_id);


--
-- Name: indications_indicated_by_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX indications_indicated_by_user_id_idx ON public.indications USING btree (indicated_by_user_id);


--
-- Name: indications_municipality_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX indications_municipality_id_idx ON public.indications USING btree (municipality_id);


--
-- Name: municipalities_name_state_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX municipalities_name_state_code_key ON public.municipalities USING btree (name, state_code);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_indicated_by_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_indicated_by_user_id_idx ON public.users USING btree (indicated_by_user_id);


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: indications indications_church_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indications
    ADD CONSTRAINT indications_church_id_fkey FOREIGN KEY (church_id) REFERENCES public.churches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: indications indications_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indications
    ADD CONSTRAINT indications_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: indications indications_indicated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indications
    ADD CONSTRAINT indications_indicated_by_user_id_fkey FOREIGN KEY (indicated_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: indications indications_municipality_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indications
    ADD CONSTRAINT indications_municipality_id_fkey FOREIGN KEY (municipality_id) REFERENCES public.municipalities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_indicated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_indicated_by_user_id_fkey FOREIGN KEY (indicated_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict hcjbAk0ni68TxWKwXXzUmnc4hG0jSQdyJtEfH7lmqqSPKogUHXPsHwFDQ9XY96T

