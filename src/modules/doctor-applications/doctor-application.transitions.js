const transitions = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['requires_changes', 'approved', 'rejected'],
  requires_changes: ['submitted'],
  approved: [],
  rejected: [],
};

export const canTransitionApplication = (from, to) => transitions[from]?.includes(to) ?? false;

export const applicationStatuses = Object.freeze(Object.keys(transitions));