-- Streak v24, Prompt 3: the vision worker hit the SAME RLS bootstrap pattern the web app hit in v21 and v22 - twice.
--
-- The worker connects as the app role and reads GameVideo/MediaAsset BEFORE any tenant context exists, so the policy
-- resolved to the platform default organization and every video belonging to any other league was invisible. The symptom
-- was `no GameVideo/MediaAsset for <id>` for a row that plainly exists, and (before that) a poller that silently saw only
-- the default organization's videos.
--
-- These two functions answer the two questions the worker has to ask before it can open a connection: "which videos are
-- ready" and "where is this video's file, and which organization owns it". Both are SECURITY DEFINER, return only the
-- columns the worker needs, and are granted to the same three roles in this same file (5-step checklist).
CREATE OR REPLACE FUNCTION app_vision_ready_videos(p_limit INT DEFAULT 20)
RETURNS TABLE (id TEXT, organization_id TEXT, game_id TEXT, fixture_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gv."id", gv."organizationId", gv."gameId", gv."fixtureId"
  FROM "GameVideo" gv
  WHERE gv."ingestStatus" = 'READY_FOR_ANALYSIS'
    AND gv."analysisEligible" = true
    AND NOT EXISTS (
      SELECT 1 FROM "VisionAnalysisRun" r
      WHERE r."gameVideoId" = gv."id" AND r."status" IN ('QUEUED', 'PROCESSING')
    )
  ORDER BY gv."createdAt" ASC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION app_vision_ready_videos(INT) IS
  'Videos the vision worker may analyse, across organizations. SECURITY DEFINER because the worker has no tenant context before it picks one.';

CREATE OR REPLACE FUNCTION app_vision_video_source(p_video_id TEXT)
RETURNS TABLE (organization_id TEXT, public_url TEXT, object_key TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gv."organizationId", m."publicUrl", m."objectKey"
  FROM "GameVideo" gv
  JOIN "MediaAsset" m ON m."id" = gv."mediaAssetId"
  WHERE gv."id" = p_video_id;
$$;

COMMENT ON FUNCTION app_vision_video_source(TEXT) IS
  'The owning organization and the stored location of one game video. SECURITY DEFINER for the same reason as app_vision_ready_videos.';

GRANT EXECUTE ON FUNCTION app_vision_ready_videos(INT) TO ultraos;
GRANT EXECUTE ON FUNCTION app_vision_ready_videos(INT) TO ultraos_app;
GRANT EXECUTE ON FUNCTION app_vision_ready_videos(INT) TO ultraos_staging;
GRANT EXECUTE ON FUNCTION app_vision_video_source(TEXT) TO ultraos;
GRANT EXECUTE ON FUNCTION app_vision_video_source(TEXT) TO ultraos_app;
GRANT EXECUTE ON FUNCTION app_vision_video_source(TEXT) TO ultraos_staging;

-- The VisionModel registry is keyed GLOBALLY by `key` but its rows are tenant-scoped, so an ordinary
-- `INSERT ... ON CONFLICT (key) DO UPDATE` from a worker whose context is organization B tries to UPDATE a row that
-- organization A owns: the policy refuses it with "new row violates row-level security policy (USING expression)". That
-- refusal is correct; the upsert is the wrong shape for a shared registry. This helper performs it with definer rights
-- and returns the id, so any organization's worker can record the model it ran.
CREATE OR REPLACE FUNCTION app_vision_ensure_model(p_organization_id TEXT, p_key TEXT, p_version TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id TEXT;
BEGIN
  SELECT id INTO v_id FROM "VisionModel" WHERE key = p_key LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE "VisionModel" SET version = p_version WHERE id = v_id;
    RETURN v_id;
  END IF;
  INSERT INTO "VisionModel" (id, "organizationId", key, version, "createdAt")
  VALUES (gen_random_uuid()::text, p_organization_id, p_key, p_version, now())
  ON CONFLICT (key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM "VisionModel" WHERE key = p_key LIMIT 1;
  END IF;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION app_vision_ensure_model(TEXT, TEXT, TEXT) IS
  'Idempotent VisionModel registry write for the vision worker. SECURITY DEFINER because the registry key is global while its rows are tenant-scoped.';

GRANT EXECUTE ON FUNCTION app_vision_ensure_model(TEXT, TEXT, TEXT) TO ultraos;
GRANT EXECUTE ON FUNCTION app_vision_ensure_model(TEXT, TEXT, TEXT) TO ultraos_app;
GRANT EXECUTE ON FUNCTION app_vision_ensure_model(TEXT, TEXT, TEXT) TO ultraos_staging;