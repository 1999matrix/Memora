import { SUMMARY_REFRESH_EVERY } from '../../common/constants/rag.constants';

function shouldRefreshSummary(
  totalMessages: number,
  summarizedThrough: number,
) {
  return totalMessages - summarizedThrough >= SUMMARY_REFRESH_EVERY;
}

describe('multi-turn memory refresh gate', () => {
  it('refreshes only after SUMMARY_REFRESH_EVERY new messages', () => {
    expect(shouldRefreshSummary(SUMMARY_REFRESH_EVERY - 1, 0)).toBe(false);
    expect(shouldRefreshSummary(SUMMARY_REFRESH_EVERY, 0)).toBe(true);
    expect(
      shouldRefreshSummary(SUMMARY_REFRESH_EVERY * 2 - 1, SUMMARY_REFRESH_EVERY),
    ).toBe(false);
    expect(
      shouldRefreshSummary(SUMMARY_REFRESH_EVERY * 2, SUMMARY_REFRESH_EVERY),
    ).toBe(true);
  });
});
