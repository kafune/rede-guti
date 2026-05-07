-- CreateTable: leader_stats
-- One row per user, updated by background recalculation jobs.
-- tenantId is nullable now; will be populated when multi-tenancy is introduced.
CREATE TABLE "leader_stats" (
    "id"                 TEXT             NOT NULL,
    "user_id"            TEXT             NOT NULL,
    "total_indications"  INTEGER          NOT NULL DEFAULT 0,
    "weekly_indications" INTEGER          NOT NULL DEFAULT 0,
    "monthly_indications" INTEGER         NOT NULL DEFAULT 0,
    "total_confirmed"    INTEGER          NOT NULL DEFAULT 0,
    "total_present"      INTEGER          NOT NULL DEFAULT 0,
    "score"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ranking_position"   INTEGER,
    "last_activity_at"   TIMESTAMP(3),
    "current_streak"     INTEGER          NOT NULL DEFAULT 0,
    "tenant_id"          TEXT,
    "created_at"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leader_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable: leader_points_ledger
-- Append-only audit trail of every point event per user.
CREATE TABLE "leader_points_ledger" (
    "id"         TEXT         NOT NULL,
    "user_id"    TEXT         NOT NULL,
    "event_type" TEXT         NOT NULL,
    "points"     INTEGER      NOT NULL,
    "metadata"   JSONB,
    "tenant_id"  TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leader_points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: leader_stats
CREATE UNIQUE INDEX "leader_stats_user_id_key"         ON "leader_stats"("user_id");
CREATE INDEX "leader_stats_score_idx"                  ON "leader_stats"("score");
CREATE INDEX "leader_stats_ranking_position_idx"       ON "leader_stats"("ranking_position");
CREATE INDEX "leader_stats_tenant_id_idx"              ON "leader_stats"("tenant_id");

-- CreateIndex: leader_points_ledger
CREATE INDEX "leader_points_ledger_user_id_idx"    ON "leader_points_ledger"("user_id");
CREATE INDEX "leader_points_ledger_event_type_idx" ON "leader_points_ledger"("event_type");
CREATE INDEX "leader_points_ledger_created_at_idx" ON "leader_points_ledger"("created_at");
CREATE INDEX "leader_points_ledger_tenant_id_idx"  ON "leader_points_ledger"("tenant_id");

-- AddForeignKey: leader_stats → users (cascade delete keeps data clean)
ALTER TABLE "leader_stats"
    ADD CONSTRAINT "leader_stats_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: leader_points_ledger → users (cascade delete)
ALTER TABLE "leader_points_ledger"
    ADD CONSTRAINT "leader_points_ledger_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
