"""Jordan Ellis' fact find: the product's own white-label workbook, filled in as the client would.

  python3 -I scripts/aurixa-reel-3/factfind.py <out dir>

Reads the product's template (npc-client-dashboard, docs/reference/Aurixa Systems - White Label Client Fact Find
Template.xlsx, the file Add New Client's "Download Template" hands out) and writes it again with Jordan's answers in the
cells the product's parser reads (src/lib/client-fact-find/fieldDefinitions.ts): Applicant 1 in column C, the assets
from row 40, the liabilities from row 53, and the monthly living expenses in the Living Expenses sheet's column C. Nothing
else in the workbook is touched, so what the parser makes of it is what the product would make of it.

Every answer is fictional, as the brand kit's demo record is (Reel 1's client, 14 Wattle Grove's buyer). No phone number
or email address is given: the client card then shows the product's own "No email on file".
"""

import datetime as dt
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
PRODUCT = Path(
    __import__("os").environ.get("AURIXA_PRODUCT", ROOT.parent / "npc-client-dashboard")
)
TEMPLATE = (
    PRODUCT
    / "docs"
    / "reference"
    / "Aurixa Systems - White Label Client Fact Find Template.xlsx"
)
OUT_NAME = "Jordan Ellis - Client Fact Find.xlsx"

# The business the workbook is branded for: the demo record's own (person.company).
WHITE_LABEL = {"B5": "Aurixa Systems · Property"}

APPLICANT = {
    "C7": "Jordan",
    "C9": "Ellis",
    "C10": dt.date(1989, 5, 14),
    "C12": "Single",
    "C13": "Australian Citizen",
    "C14": 0,
    "C19": "7/22 Banksia Parade, Banksia Rise NSW 2155",
    "C20": "Renting",
    "C21": dt.date(2022, 2, 1),
    "C27": "Full-time",
    "C28": "Brightwater Engineering Pty Ltd",
    "C29": "Engineering Manager",
    "C31": dt.date(2019, 7, 1),
    "C32": 300000,
}

# Rows 40 to 49: Asset Type, Description / Address, Owner, Current Value, Rental / Other Income, Financial Institution,
# Loan Balance, Monthly Repayment, Interest Rate, Maturity Date.
ASSETS = [
    ["Savings", "Savings account", "Jordan Ellis", 300000],
    ["Superannuation", "Superannuation fund", "Jordan Ellis", 212000],
    ["Motor vehicle", "Motor vehicle (2023 sedan)", "Jordan Ellis", 34000],
]

# Rows 53 to 60: Liability Type, Lender, Account / Description, Owner, Limit / Original Amount, Current Balance,
# Monthly Repayment, Interest Rate, Remaining Term, Notes. No lender is named: the film names no third party.
LIABILITIES = [
    [
        "Car loan",
        None,
        "Car loan",
        "Jordan Ellis",
        32000,
        18000,
        520,
        7.9,
        "3 years",
        None,
    ],
    [
        "Credit card",
        None,
        "Credit card",
        "Jordan Ellis",
        10000,
        1200,
        0,
        20.99,
        None,
        None,
    ],
]

# The Living Expenses sheet: the item's label (column B, as the template sets it) and its monthly amount. Rent is
# $650 a week, $2,817 a month (650 x 52 / 12). Every other item stays at 0, the template's own figure for it
# (its Higher Education row is pre-filled at 600 and is set to 0 here: Jordan studies nothing).
EXPENSES = {
    "Higher Education / Vocational Training": 0,
    "Groceries": 900,
    "Electricity & Gas": 160,
    "Contents Insurance": 35,
    "Health Insurance": 190,
    "Income Protection": 110,
    "Vehicle Insurance": 110,
    "Medical & Health": 80,
    "Rent": 2817,
    "Clothing & Footwear": 200,
    "Cosmetics / Haircare": 60,
    "Dining Out": 450,
    "Gym / Sports": 120,
    "Travel & Holidays": 400,
    "Gifts & Miscellaneous": 100,
    "Home / Mobile Phone": 75,
    "Internet / Pay TV / Streaming": 90,
    "Petrol": 220,
    "Registration": 70,
    "Vehicle Maintenance": 80,
    "Public Transport": 60,
    "Tolls / Parking": 120,
}


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.load_workbook(TEMPLATE)
    for cell, value in WHITE_LABEL.items():
        wb["White Label Setup"][cell] = value
    fact = wb["Client Fact Find"]
    for cell, value in APPLICANT.items():
        fact[cell] = value
    for i, row in enumerate(ASSETS):
        for j, value in enumerate(row):
            fact.cell(row=40 + i, column=1 + j, value=value)
    for i, row in enumerate(LIABILITIES):
        for j, value in enumerate(row):
            fact.cell(row=53 + i, column=1 + j, value=value)
    exp = wb["Living Expenses"]
    seen = set()
    for r in range(5, 55):
        label = exp.cell(row=r, column=2).value
        if label in EXPENSES:
            exp.cell(row=r, column=3, value=EXPENSES[label])
            seen.add(label)
    missing = set(EXPENSES) - seen
    if missing:
        sys.exit(f"The template has no Living Expenses row for {sorted(missing)}")
    file = out / OUT_NAME
    wb.save(file)
    total = sum(EXPENSES.values())
    print(
        f"{file}: {len(ASSETS)} assets, {len(LIABILITIES)} liabilities, living expenses ${total:,} a month "
        f"(${total - EXPENSES['Rent']:,} besides the rent)"
    )


if __name__ == "__main__":
    main()
