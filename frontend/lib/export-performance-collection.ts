import { PerformanceCollectionReportResponse } from "@/types";

function escapeCsv(str: unknown): string {
  if (str === null || str === undefined) return '""';
  const s = String(str).replace(/"/g, '""');
  return `"${s}"`;
}

export function exportPerformanceCollectionToCSV(
  data: PerformanceCollectionReportResponse,
  filename?: string
) {
  const lines: string[] = [];

  // Document Title
  lines.push(`"SUNSET GROUP - EMPLOYEE PERFORMANCE & COLLECTION REPORT"`);
  lines.push(`"Report Month",${escapeCsv(data.month)}`);
  lines.push(`"Date Period",${escapeCsv(`${data.date_from} to ${data.date_to}`)}`);
  lines.push(`"Generated On",${escapeCsv(new Date().toLocaleString())}`);
  lines.push("");

  // ═════════════════════════════════════════════════════════════════════════════
  // SECTION 1: EMPLOYEE MONTHLY PERFORMANCE REPORT
  // ═════════════════════════════════════════════════════════════════════════════
  lines.push(`"SECTION 1: EMPLOYEE MONTHLY PERFORMANCE REPORT"`);
  lines.push(
    [
      "Employee Name",
      "Position",
      "Month",
      "TG (Target BDT)",
      "New Sales (BDT)",
      "EMI (BDT)",
      "Total Collection (BDT)",
      "Total Lead",
      "Fair Lead",
      "FB Leads",
      "HP",
      "P",
      "FUP",
      "Total Calls",
      "Sold from Fair Leads",
      "Sold From FB Leads",
      "Sold From Other Leads",
      "GL",
      "Hold",
      "Cancel",
      "Total Lead (HP+P) / Collection",
    ]
      .map(escapeCsv)
      .join(",")
  );

  for (const emp of data.monthly_performances) {
    // If historical previous months exist, output them first
    if (emp.history_months && emp.history_months.length > 0) {
      for (const hm of emp.history_months) {
        lines.push(
          [
            emp.employee_name,
            emp.position,
            hm.month,
            hm.target_sales,
            hm.actual_new_sales,
            hm.actual_emi,
            hm.total_collection,
            hm.total_lead,
            hm.fair_lead,
            hm.fb_lead,
            hm.hp,
            hm.p,
            hm.fup,
            hm.total_calls || 0,
            hm.prediction_sold_fair,
            hm.prediction_sold_fb,
            hm.prediction_sold_other,
            hm.gl || emp.position,
            hm.prediction_hold,
            hm.prediction_cancel,
            `${hm.hp + hm.p} / ${hm.total_collection}`,
          ]
            .map(escapeCsv)
            .join(",")
        );
      }
    }

    // Active Month Row
    lines.push(
      [
        emp.employee_name,
        emp.position,
        emp.month,
        emp.target_sales,
        emp.actual_new_sales,
        emp.actual_emi,
        emp.total_collection,
        emp.total_lead,
        emp.fair_lead,
        emp.fb_lead,
        emp.hp,
        emp.p,
        emp.fup,
        emp.total_calls || 0,
        emp.prediction_sold_fair,
        emp.prediction_sold_fb,
        emp.prediction_sold_other,
        emp.gl || emp.position,
        emp.prediction_hold,
        emp.prediction_cancel,
        `${emp.hp + emp.p} / ${emp.total_collection}`,
      ]
        .map(escapeCsv)
        .join(",")
    );

    // If employee has milestone checkpoints, list them indented
    if (emp.intervals && emp.intervals.length > 0) {
      for (const inv of emp.intervals) {
        lines.push(
          [
            `  ↳ [Progress] ${inv.label}`,
            "-",
            "-",
            "-",
            inv.new_sales,
            inv.emi,
            inv.total_collection,
            inv.total_lead,
            inv.fair_lead,
            inv.fb_lead,
            inv.hp,
            inv.p,
            inv.fup,
            inv.total_calls || 0,
            inv.sold_fair || 0,
            inv.sold_fb || 0,
            inv.sold_other || 0,
            inv.gl || "-",
            inv.hold || 0,
            inv.cancel || 0,
            `${inv.hp + inv.p} / ${inv.total_collection}`,
          ]
            .map(escapeCsv)
            .join(",")
        );
      }
    }
  }

  // Section 1 Totals
  lines.push(
    [
      "SECTION 1 TOTALS",
      "-",
      "-",
      data.summary.total_target,
      data.summary.total_new_sales,
      data.summary.total_emi,
      data.summary.total_collection,
      data.summary.total_leads,
      data.summary.total_fair_leads,
      data.summary.total_fb_leads,
      data.summary.total_hp,
      data.summary.total_p,
      data.summary.total_fup,
      "-",
      "-",
      "-",
      "-",
      "-",
    ]
      .map(escapeCsv)
      .join(",")
  );

  lines.push("");
  lines.push("");

  // ═════════════════════════════════════════════════════════════════════════════
  // SECTION 2: CUSTOMER-WISE COLLECTION REPORT
  // ═════════════════════════════════════════════════════════════════════════════
  lines.push(`"SECTION 2: CUSTOMER-WISE COLLECTION REPORT"`);
  lines.push(
    [
      "Customer ID",
      "Cx Name",
      "Phone",
      "Paid (BDT)",
      "Unpaid (BDT)",
      "Collection Date",
      "IN/OUT Plan",
      "Date-1",
      "Date 2",
      "New Sales (BDT)",
      "TB (BDT)",
      "EMI (BDT)",
      "Next Collec Date 1",
      "Next Collec Date 2",
      "Lead Status",
      "Lead Source",
      "Lead Source Date",
      "Total Collection (BDT)",
      "Executive",
      "Remarks",
    ]
      .map(escapeCsv)
      .join(",")
  );

  for (const c of data.customer_collections) {
    lines.push(
      [
        c.customer_code || `CX-${1000 + c.id}`,
        c.customer_name,
        c.customer_phone || "-",
        c.paid_amount,
        c.unpaid_amount,
        c.collection_date || "-",
        c.in_out_plan,
        c.date_1 || "-",
        c.date_2 || "-",
        c.new_sales_amount,
        c.tb_amount,
        c.emi_amount,
        c.next_collection_date || "-",
        c.next_collection_date_2 || "-",
        c.lead_status,
        c.lead_source || "Direct Lead",
        c.lead_source_date || c.date_1 || "-",
        c.total_collection,
        c.employee_name,
        c.remarks || "-",
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  // Section 2 Totals
  lines.push(
    [
      "SECTION 2 TOTALS",
      "-",
      data.summary.total_paid,
      data.summary.total_unpaid,
      "-",
      "-",
      "-",
      "-",
      data.summary.total_new_sales,
      data.summary.total_tb,
      data.summary.total_emi,
      "-",
      "-",
      data.summary.total_collection,
      "-",
      "-",
    ]
      .map(escapeCsv)
      .join(",")
  );

  // UTF-8 BOM for Microsoft Excel compatibility
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    filename || `SunsetGroup_Performance_Collection_${data.month.replace(/\s+/g, "_")}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

