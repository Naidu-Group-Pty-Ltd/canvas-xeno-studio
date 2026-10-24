/**
 * Stand-in for Add New Client's import of the product's own fact find template
 * (src/components/clients/add-client/ExcelImportTab.tsx:
 * `import advancedClientTemplateUrl from '../../../../docs/reference/Aurixa Systems - White Label Client Fact Find
 * Template.xlsx?inline'`). The product builds it through its vite-inline-xlsx.ts plugin, which inlines the workbook
 * as a data URL; the harness's Vite has no such plugin, so the same workbook is served by URL instead. It is only the
 * href of "Download Template", which no picture shows; the workbook is the product's file, unchanged.
 */
export { default } from "@/../docs/reference/Aurixa Systems - White Label Client Fact Find Template.xlsx?url";
