CREATE UNIQUE INDEX IF NOT EXISTS operations_generation_id_unique
  ON public.operations (generation_id) WHERE generation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_ready_operations(claim_limit integer DEFAULT 5)
 RETURNS SETOF public.operations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM public.operations o
    WHERE o.status IN ('ready','local_queued')
      AND o.generation_id IS NULL -- generation-linked records mirror the V1 pipeline and are never dispatched here
      AND NOT EXISTS (
        SELECT 1 FROM public.operation_dependencies d
        JOIN public.operations dep ON dep.id = d.depends_on_operation_id
        WHERE d.operation_id = o.id
          AND d.dependency_mode <> 'optional'
          AND dep.status <> 'completed'
      )
    ORDER BY o.priority ASC, o.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT claim_limit
  )
  UPDATE public.operations o
  SET status = 'dispatching', dispatch_started_at = now(), attempt = o.attempt + 1
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.*;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.claim_ready_operations(integer) FROM PUBLIC, anon, authenticated;