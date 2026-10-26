// Answers the harness's backend gives for calls every page makes in passing, by what the product's own functions
// answer when there is nothing to report: the report template menu (manage-templates: no templates chosen).
export default {
  "manage-templates": () => ({ success: true, templates: [], data: [], selections: [] }),
};
