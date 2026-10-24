/** Jordan Ellis (fictional), the record every Reel 3 screen draws, and the shape of a screen. */
import type { CSSProperties, ReactNode } from "react";

export const CLIENT = "00000000-0000-4000-8000-00000000e115";
export const CLIENT_NAME = "Jordan Ellis";

export interface Screen {
  /** The address the page is opened at (react-router's MemoryRouter). */
  route?: string;
  style?: CSSProperties;
  render: (q: URLSearchParams) => ReactNode;
}
