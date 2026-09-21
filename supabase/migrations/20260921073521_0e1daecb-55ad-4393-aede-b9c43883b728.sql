DROP POLICY IF EXISTS "members create operations" ON public.operations;

DROP POLICY IF EXISTS "members all wf templates" ON public.workflow_templates;
CREATE POLICY "members read wf templates" ON public.workflow_templates FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members create wf templates" ON public.workflow_templates FOR INSERT TO authenticated WITH CHECK (public.is_active_member() AND is_system = false);
CREATE POLICY "members update own wf templates" ON public.workflow_templates FOR UPDATE TO authenticated USING (public.is_active_member() AND (is_system = false OR public.is_admin())) WITH CHECK (public.is_active_member() AND (is_system = false OR public.is_admin()));
CREATE POLICY "members delete wf templates" ON public.workflow_templates FOR DELETE TO authenticated USING (public.is_active_member() AND (is_system = false OR public.is_admin()));

DROP POLICY IF EXISTS "members all wf nodes" ON public.workflow_nodes;
CREATE POLICY "members read wf nodes" ON public.workflow_nodes FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members write wf nodes" ON public.workflow_nodes FOR ALL TO authenticated
  USING (public.is_active_member() AND EXISTS (SELECT 1 FROM public.workflow_templates t WHERE t.id = workflow_nodes.workflow_template_id AND (t.is_system = false OR public.is_admin())))
  WITH CHECK (public.is_active_member() AND EXISTS (SELECT 1 FROM public.workflow_templates t WHERE t.id = workflow_nodes.workflow_template_id AND (t.is_system = false OR public.is_admin())));

DROP POLICY IF EXISTS "members all wf edges" ON public.workflow_edges;
CREATE POLICY "members read wf edges" ON public.workflow_edges FOR SELECT TO authenticated USING (public.is_active_member());
CREATE POLICY "members write wf edges" ON public.workflow_edges FOR ALL TO authenticated
  USING (public.is_active_member() AND EXISTS (SELECT 1 FROM public.workflow_templates t WHERE t.id = workflow_edges.workflow_template_id AND (t.is_system = false OR public.is_admin())))
  WITH CHECK (public.is_active_member() AND EXISTS (SELECT 1 FROM public.workflow_templates t WHERE t.id = workflow_edges.workflow_template_id AND (t.is_system = false OR public.is_admin())));