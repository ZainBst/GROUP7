import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { StudentAggregatesProvider, useStudentAggregates } from "./StudentAggregatesContext";

vi.mock("@/hooks/useRealtimeEvents", () => ({
  useRealtimeEvents: () => [],
}));

describe("StudentAggregatesContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when used outside provider", () => {
    expect(() => renderHook(() => useStudentAggregates())).toThrow(
      "useStudentAggregates must be used within StudentAggregatesProvider"
    );
  });

  it("provides initial empty students and sessionStart", () => {
    const { result } = renderHook(() => useStudentAggregates(), {
      wrapper: ({ children }) => (
        <StudentAggregatesProvider>{children}</StudentAggregatesProvider>
      ),
    });

    expect(result.current.students).toEqual([]);
    expect(result.current.sessionStart).toBeNull();
  });
});
