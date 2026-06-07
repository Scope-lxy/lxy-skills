export interface MaterialSelectionPlan {
  articleImageIndexes: readonly [1, 2];
  articleCoverIndex: 3;
}

export const DEFAULT_MATERIAL_SELECTION_PLAN: MaterialSelectionPlan = {
  articleImageIndexes: [1, 2],
  articleCoverIndex: 3
};
