import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  classifyRecruiter,
  decideRecruiterSend,
  decideSeekerDigest,
  computeConversions,
  matchesSeekerProfile,
  matchesJobAlert,
  selectUnseenJobs,
  hasEmptyProfile,
  LAPSED_THRESHOLD_DAYS,
  LAPSED_SCHEDULE_DAYS,
  NEVER_POSTED_SCHEDULE_DAYS,
  MAX_SEQUENCE_STEPS,
  MIN_GAP_DAYS,
  type RecruiterActivity,
} from "@/lib/reengagement";

const NOW = new Date("2026-08-27T10:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function recruiter(overrides: Partial<RecruiterActivity> = {}): RecruiterActivity {
  return {
    accountCreatedAt: daysAgo(90),
    lastPostAt: null,
    postCount: 0,
    priorSendsAt: [],
    marketingEmailsEnabled: true,
    ...overrides,
  };
}

// ─── Segmentation ────────────────────────────────────────────────────────────

describe("classifyRecruiter", () => {
  it("classifies a recruiter with zero posts as NEVER_POSTED", () => {
    expect(classifyRecruiter({ postCount: 0, lastPostAt: null }, NOW)).toBe("NEVER_POSTED");
  });

  it("classifies a post older than the threshold as LAPSED", () => {
    expect(classifyRecruiter({ postCount: 2, lastPostAt: daysAgo(8) }, NOW)).toBe("LAPSED");
  });

  it("classifies a recent poster as ACTIVE", () => {
    expect(classifyRecruiter({ postCount: 1, lastPostAt: daysAgo(3) }, NOW)).toBe("ACTIVE");
  });

  it("treats exactly the threshold as lapsed", () => {
    expect(
      classifyRecruiter({ postCount: 1, lastPostAt: daysAgo(LAPSED_THRESHOLD_DAYS) }, NOW)
    ).toBe("LAPSED");
  });

  it("treats a moment under the threshold as active", () => {
    const justUnder = new Date(
      NOW.getTime() - (LAPSED_THRESHOLD_DAYS * 24 * 60 * 60 * 1000 - 1000)
    );
    expect(classifyRecruiter({ postCount: 1, lastPostAt: justUnder }, NOW)).toBe("ACTIVE");
  });

  it("trusts postCount over a stale lastPostAt", () => {
    expect(classifyRecruiter({ postCount: 0, lastPostAt: daysAgo(30) }, NOW)).toBe("NEVER_POSTED");
  });
});

// ─── Lapsed sequence ─────────────────────────────────────────────────────────

describe("decideRecruiterSend — lapsed poster", () => {
  it("sends step 1 once 7 days have passed since the last post", () => {
    const d = decideRecruiterSend(recruiter({ postCount: 3, lastPostAt: daysAgo(7) }), NOW);
    expect(d).toMatchObject({ send: true, campaign: "RECRUITER_LAPSED", sequenceStep: 1 });
  });

  it("does not send to an active recruiter", () => {
    const d = decideRecruiterSend(recruiter({ postCount: 3, lastPostAt: daysAgo(2) }), NOW);
    expect(d.send).toBe(false);
    expect(d.reason).toBe("active");
  });

  it("waits for the step 2 date even after the min gap has elapsed", () => {
    // Step 1 sent 8 days ago (min gap satisfied) but only day 12 since the post.
    const d = decideRecruiterSend(
      recruiter({ postCount: 1, lastPostAt: daysAgo(12), priorSendsAt: [daysAgo(8)] }),
      NOW
    );
    expect(d.send).toBe(false);
    expect(d.reason).toBe("not_yet_due");
  });

  it("sends step 2 at day 14", () => {
    const d = decideRecruiterSend(
      recruiter({ postCount: 1, lastPostAt: daysAgo(14), priorSendsAt: [daysAgo(7)] }),
      NOW
    );
    expect(d).toMatchObject({ send: true, sequenceStep: 2 });
  });

  it("sends step 3 at day 28", () => {
    const d = decideRecruiterSend(
      recruiter({
        postCount: 1,
        lastPostAt: daysAgo(28),
        priorSendsAt: [daysAgo(21), daysAgo(14)],
      }),
      NOW
    );
    expect(d).toMatchObject({ send: true, sequenceStep: 3 });
  });

  it("stops after three nudges no matter how long they stay lapsed", () => {
    const d = decideRecruiterSend(
      recruiter({
        postCount: 1,
        lastPostAt: daysAgo(365),
        priorSendsAt: [daysAgo(300), daysAgo(200), daysAgo(100)],
      }),
      NOW
    );
    expect(d.send).toBe(false);
    expect(d.reason).toBe("sequence_complete");
  });

  it("resets the sequence when the recruiter posts again", () => {
    // Three nudges sent, then they posted 10 days ago and went quiet again.
    const d = decideRecruiterSend(
      recruiter({
        postCount: 4,
        lastPostAt: daysAgo(10),
        priorSendsAt: [daysAgo(60), daysAgo(50), daysAgo(40)],
      }),
      NOW
    );
    expect(d).toMatchObject({ send: true, sequenceStep: 1 });
  });

  it("never sends to someone who opted out", () => {
    const d = decideRecruiterSend(
      recruiter({ postCount: 1, lastPostAt: daysAgo(90), marketingEmailsEnabled: false }),
      NOW
    );
    expect(d.send).toBe(false);
    expect(d.reason).toBe("opted_out");
  });
});

// ─── Never-posted sequence ───────────────────────────────────────────────────

describe("decideRecruiterSend — never posted", () => {
  it("holds off during the first days after signup", () => {
    const d = decideRecruiterSend(recruiter({ accountCreatedAt: daysAgo(1) }), NOW);
    expect(d.send).toBe(false);
    expect(d.reason).toBe("not_yet_due");
  });

  it("sends the onboarding nudge at day 3", () => {
    const d = decideRecruiterSend(recruiter({ accountCreatedAt: daysAgo(3) }), NOW);
    expect(d).toMatchObject({
      send: true,
      campaign: "RECRUITER_NEVER_POSTED",
      sequenceStep: 1,
    });
  });

  it("caps the onboarding sequence at three", () => {
    const d = decideRecruiterSend(
      recruiter({
        accountCreatedAt: daysAgo(200),
        priorSendsAt: [daysAgo(150), daysAgo(120), daysAgo(90)],
      }),
      NOW
    );
    expect(d.send).toBe(false);
    expect(d.reason).toBe("sequence_complete");
  });
});

// ─── The duplicate-send guarantee ────────────────────────────────────────────

describe("duplicate send prevention", () => {
  it("never sends twice within the minimum gap", () => {
    const d = decideRecruiterSend(
      recruiter({
        postCount: 1,
        lastPostAt: daysAgo(40),
        priorSendsAt: [daysAgo(1)],
      }),
      NOW
    );
    expect(d.send).toBe(false);
    expect(d.reason).toBe("min_gap_not_elapsed");
  });

  it("simulating a daily cron over a year sends at most 3 emails per lapse", () => {
    // A recruiter posts once, then never again. Run the decision every day for
    // a year, appending each send to their history exactly as the cron would.
    const postAt = new Date("2026-01-01T00:00:00.000Z");
    const sends: Date[] = [];

    for (let day = 0; day < 365; day++) {
      const now = new Date(postAt.getTime() + day * 24 * 60 * 60 * 1000);
      const decision = decideRecruiterSend(
        {
          accountCreatedAt: postAt,
          lastPostAt: postAt,
          postCount: 1,
          priorSendsAt: [...sends],
          marketingEmailsEnabled: true,
        },
        now
      );
      if (decision.send) sends.push(now);
    }

    expect(sends).toHaveLength(MAX_SEQUENCE_STEPS);

    // And they land on the scheduled days, not on consecutive ones.
    const offsets = sends.map(s =>
      Math.round((s.getTime() - postAt.getTime()) / (24 * 60 * 60 * 1000))
    );
    expect(offsets).toEqual([...LAPSED_SCHEDULE_DAYS]);
  });

  it("simulating a daily cron for a never-posted recruiter also caps at 3", () => {
    const signup = new Date("2026-01-01T00:00:00.000Z");
    const sends: Date[] = [];

    for (let day = 0; day < 365; day++) {
      const now = new Date(signup.getTime() + day * 24 * 60 * 60 * 1000);
      const decision = decideRecruiterSend(
        {
          accountCreatedAt: signup,
          lastPostAt: null,
          postCount: 0,
          priorSendsAt: [...sends],
          marketingEmailsEnabled: true,
        },
        now
      );
      if (decision.send) sends.push(now);
    }

    const offsets = sends.map(s =>
      Math.round((s.getTime() - signup.getTime()) / (24 * 60 * 60 * 1000))
    );
    expect(offsets).toEqual([...NEVER_POSTED_SCHEDULE_DAYS]);
  });

  it("property: two sends are never closer together than the minimum gap", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.array(fc.integer({ min: 0, max: 400 }), { maxLength: 3 }),
        (lastPostDaysAgo, sendDaysAgo) => {
          const priorSendsAt = sendDaysAgo.map(daysAgo);
          const decision = decideRecruiterSend(
            recruiter({
              postCount: 1,
              lastPostAt: daysAgo(lastPostDaysAgo),
              priorSendsAt,
            }),
            NOW
          );
          if (!decision.send) return true;

          // Only sends after the anchor gate the next one.
          const anchor = daysAgo(lastPostDaysAgo).getTime();
          const relevant = priorSendsAt.filter(d => d.getTime() > anchor);
          if (relevant.length === 0) return true;

          const mostRecent = Math.max(...relevant.map(d => d.getTime()));
          const gapDays = (NOW.getTime() - mostRecent) / (24 * 60 * 60 * 1000);
          return gapDays >= MIN_GAP_DAYS;
        }
      )
    );
  });

  it("property: opted-out users never receive anything", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 20 }),
        (lastPostDaysAgo, postCount) => {
          const decision = decideRecruiterSend(
            recruiter({
              postCount,
              lastPostAt: postCount > 0 ? daysAgo(lastPostDaysAgo) : null,
              marketingEmailsEnabled: false,
            }),
            NOW
          );
          return decision.send === false;
        }
      )
    );
  });

  it("property: sequence step is always within 1..3 when sending", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.array(fc.integer({ min: 0, max: 400 }), { maxLength: 6 }),
        fc.boolean(),
        (anchorDaysAgo, sendDaysAgo, hasPosted) => {
          const decision = decideRecruiterSend(
            recruiter({
              accountCreatedAt: daysAgo(400),
              postCount: hasPosted ? 1 : 0,
              lastPostAt: hasPosted ? daysAgo(anchorDaysAgo) : null,
              priorSendsAt: sendDaysAgo.map(daysAgo),
            }),
            NOW
          );
          if (!decision.send) return true;
          return decision.sequenceStep >= 1 && decision.sequenceStep <= MAX_SEQUENCE_STEPS;
        }
      )
    );
  });
});

// ─── Seeker digest cadence ───────────────────────────────────────────────────

describe("decideSeekerDigest", () => {
  it("sends when nothing has gone out", () => {
    expect(
      decideSeekerDigest({ marketingEmailsEnabled: true, priorDigestSentAt: [] }, NOW).send
    ).toBe(true);
  });

  it("does not send twice in one day", () => {
    const d = decideSeekerDigest(
      {
        marketingEmailsEnabled: true,
        priorDigestSentAt: [new Date(NOW.getTime() - 2 * 60 * 60 * 1000)],
      },
      NOW
    );
    expect(d.send).toBe(false);
    expect(d.reason).toBe("min_gap_not_elapsed");
  });

  it("sends again the next day", () => {
    expect(
      decideSeekerDigest(
        { marketingEmailsEnabled: true, priorDigestSentAt: [daysAgo(1)] },
        NOW
      ).send
    ).toBe(true);
  });

  it("blocks the weekly newsletter from stacking on the daily digest", () => {
    const d = decideSeekerDigest(
      {
        marketingEmailsEnabled: true,
        priorDigestSentAt: [daysAgo(3), new Date(NOW.getTime() - 60 * 60 * 1000)],
      },
      NOW
    );
    expect(d.send).toBe(false);
  });

  it("respects opt-out", () => {
    expect(
      decideSeekerDigest({ marketingEmailsEnabled: false, priorDigestSentAt: [] }, NOW).reason
    ).toBe("opted_out");
  });
});

// ─── Matching ────────────────────────────────────────────────────────────────

describe("matchesSeekerProfile", () => {
  const job = {
    title: "Senior React Developer",
    skills: ["React", "TypeScript"],
    city: "Lahore",
    description: "Build things",
  };

  it("matches on a skill tag, case-insensitively", () => {
    expect(
      matchesSeekerProfile(job, { skills: ["react"], targetRoles: [], location: null })
    ).toBe(true);
  });

  it("matches on a skill appearing in the title", () => {
    expect(
      matchesSeekerProfile(job, { skills: ["Developer"], targetRoles: [], location: null })
    ).toBe(true);
  });

  it("matches on a target role", () => {
    expect(
      matchesSeekerProfile(job, { skills: [], targetRoles: ["react developer"], location: null })
    ).toBe(true);
  });

  it("does not match an unrelated profile", () => {
    expect(
      matchesSeekerProfile(job, { skills: ["Django"], targetRoles: ["DevOps"], location: null })
    ).toBe(false);
  });

  it("does not match on location alone", () => {
    expect(
      matchesSeekerProfile(job, { skills: [], targetRoles: [], location: "Lahore" })
    ).toBe(false);
  });

  it("ignores blank entries", () => {
    expect(
      matchesSeekerProfile(job, { skills: ["  "], targetRoles: [""], location: null })
    ).toBe(false);
  });
});

describe("hasEmptyProfile", () => {
  it("is true when skills and roles are empty or blank", () => {
    expect(hasEmptyProfile({ skills: [], targetRoles: ["  "], location: "Karachi" })).toBe(true);
  });

  it("is false when any skill is present", () => {
    expect(hasEmptyProfile({ skills: ["Go"], targetRoles: [], location: null })).toBe(false);
  });
});

describe("matchesJobAlert", () => {
  const job = {
    title: "Backend Engineer",
    description: "Node and Postgres",
    skills: ["Node.js", "PostgreSQL"],
    city: "Karachi",
    jobType: "FULL_TIME",
    experienceLevel: "MID",
    salaryMin: 250000,
  };

  const alert = {
    keywords: ["node"],
    city: null,
    jobType: null,
    experienceLevel: null,
    salaryMin: null,
  };

  it("matches a keyword in the description", () => {
    expect(matchesJobAlert(job, alert)).toBe(true);
  });

  it("matches a keyword against a skill tag", () => {
    expect(matchesJobAlert(job, { ...alert, keywords: ["postgresql"] })).toBe(true);
  });

  it("rejects a non-matching keyword", () => {
    expect(matchesJobAlert(job, { ...alert, keywords: ["rust"] })).toBe(false);
  });

  it("applies the city filter", () => {
    expect(matchesJobAlert(job, { ...alert, city: "Lahore" })).toBe(false);
    expect(matchesJobAlert(job, { ...alert, city: "karachi" })).toBe(true);
  });

  it("applies the jobType and experienceLevel filters", () => {
    expect(matchesJobAlert(job, { ...alert, jobType: "REMOTE" })).toBe(false);
    expect(matchesJobAlert(job, { ...alert, experienceLevel: "MID" })).toBe(true);
  });

  it("applies the salary floor", () => {
    expect(matchesJobAlert(job, { ...alert, salaryMin: 300000 })).toBe(false);
    expect(matchesJobAlert(job, { ...alert, salaryMin: 200000 })).toBe(true);
  });

  it("matches on structural filters alone when there are no keywords", () => {
    expect(
      matchesJobAlert(job, { keywords: [], city: "Karachi", jobType: null, experienceLevel: null, salaryMin: null })
    ).toBe(true);
  });
});

// ─── Per-job dedupe ──────────────────────────────────────────────────────────

describe("selectUnseenJobs", () => {
  const jobs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("drops jobs already emailed", () => {
    expect(selectUnseenJobs(jobs, ["a", "c"], 10).map(j => j.id)).toEqual(["b", "d"]);
  });

  it("respects the limit", () => {
    expect(selectUnseenJobs(jobs, [], 2).map(j => j.id)).toEqual(["a", "b"]);
  });

  it("returns nothing when everything has been seen", () => {
    expect(selectUnseenJobs(jobs, ["a", "b", "c", "d"], 10)).toEqual([]);
  });

  it("property: never returns a job that was already emailed", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { maxLength: 30 }),
        fc.array(fc.string({ minLength: 1 }), { maxLength: 30 }),
        fc.integer({ min: 1, max: 15 }),
        (ids, seen, limit) => {
          const candidates = ids.map(id => ({ id }));
          const out = selectUnseenJobs(candidates, seen, limit);
          const seenSet = new Set(seen);
          return out.length <= limit && out.every(j => !seenSet.has(j.id));
        }
      )
    );
  });
});

// ─── Conversion tracking ─────────────────────────────────────────────────────

describe("computeConversions", () => {
  it("counts a recruiter who posted inside the window", () => {
    const stats = computeConversions(
      {
        sends: [{ userId: "r1", sentAt: daysAgo(10) }],
        posts: [{ recruiterId: "r1", createdAt: daysAgo(6) }],
      },
      7
    );
    expect(stats).toMatchObject({ emailsSent: 1, recipients: 1, converted: 1, conversionRate: 100 });
  });

  it("ignores a post outside the window", () => {
    const stats = computeConversions(
      {
        sends: [{ userId: "r1", sentAt: daysAgo(30) }],
        posts: [{ recruiterId: "r1", createdAt: daysAgo(2) }],
      },
      7
    );
    expect(stats.converted).toBe(0);
  });

  it("ignores a post that predates the email", () => {
    const stats = computeConversions(
      {
        sends: [{ userId: "r1", sentAt: daysAgo(5) }],
        posts: [{ recruiterId: "r1", createdAt: daysAgo(20) }],
      },
      7
    );
    expect(stats.converted).toBe(0);
  });

  it("counts a recipient once even across a 3-step sequence", () => {
    const stats = computeConversions(
      {
        sends: [
          { userId: "r1", sentAt: daysAgo(30) },
          { userId: "r1", sentAt: daysAgo(23) },
          { userId: "r1", sentAt: daysAgo(16) },
        ],
        posts: [{ recruiterId: "r1", createdAt: daysAgo(12) }],
      },
      7
    );
    expect(stats.emailsSent).toBe(3);
    expect(stats.recipients).toBe(1);
    expect(stats.converted).toBe(1);
    expect(stats.conversionRate).toBe(100);
  });

  it("reports a partial rate across several recruiters", () => {
    const stats = computeConversions(
      {
        sends: [
          { userId: "r1", sentAt: daysAgo(10) },
          { userId: "r2", sentAt: daysAgo(10) },
          { userId: "r3", sentAt: daysAgo(10) },
        ],
        posts: [{ recruiterId: "r1", createdAt: daysAgo(8) }],
      },
      7
    );
    expect(stats.converted).toBe(1);
    expect(stats.recipients).toBe(3);
    expect(stats.conversionRate).toBe(33.3);
  });

  it("handles no sends without dividing by zero", () => {
    expect(computeConversions({ sends: [], posts: [] }, 7)).toEqual({
      emailsSent: 0,
      recipients: 0,
      converted: 0,
      conversionRate: 0,
    });
  });

  it("property: converted never exceeds recipients", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            userId: fc.constantFrom("a", "b", "c"),
            sentAtDays: fc.integer({ min: 0, max: 60 }),
          }),
          { maxLength: 20 }
        ),
        fc.array(
          fc.record({
            recruiterId: fc.constantFrom("a", "b", "c"),
            createdAtDays: fc.integer({ min: 0, max: 60 }),
          }),
          { maxLength: 20 }
        ),
        fc.integer({ min: 1, max: 30 }),
        (sends, posts, windowDays) => {
          const stats = computeConversions(
            {
              sends: sends.map(s => ({ userId: s.userId, sentAt: daysAgo(s.sentAtDays) })),
              posts: posts.map(p => ({
                recruiterId: p.recruiterId,
                createdAt: daysAgo(p.createdAtDays),
              })),
            },
            windowDays
          );
          return (
            stats.converted <= stats.recipients &&
            stats.recipients <= stats.emailsSent &&
            stats.conversionRate >= 0 &&
            stats.conversionRate <= 100
          );
        }
      )
    );
  });
});
