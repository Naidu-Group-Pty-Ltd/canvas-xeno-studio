/**
 * Borrowing Capacity: the client's card (BorrowingCapacityCard, on the client workspace's Borrowing Capacity tab), the
 * page (BorrowingCapacityWorkspace: the calculator, Portfolio Scenario Modelling and History), running on Jordan's
 * record with the product's own function answering them.
 */
import { BorrowingCapacityCard } from "@/components/borrowing-capacity/BorrowingCapacityCard";
import { BorrowingCapacityWorkspace } from "@/components/borrowing-capacity/BorrowingCapacityWorkspace";
import { CLIENT, CLIENT_NAME, type Screen } from "../record";

export const SCREENS: Record<string, Screen> = {
  "bc-card": {
    style: { padding: 24 },
    render: () => (
      <BorrowingCapacityCard
        clientId={CLIENT}
        clientName={CLIENT_NAME}
        onOpenCalculator={() => undefined}
      />
    ),
  },
  "bc-page": {
    route: `/clients/${CLIENT}/borrowing-capacity`,
    render: () => <BorrowingCapacityWorkspace clientId={CLIENT} />,
  },
};
