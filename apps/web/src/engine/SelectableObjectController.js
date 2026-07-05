export class SelectableObjectController {
  constructor({
    sceneObjectManager,
    selectionManager,
    buildingEnvelopeController,
    log
  }) {
    this.sceneObjectManager = sceneObjectManager;
    this.selectionManager = selectionManager;
    this.buildingEnvelopeController = buildingEnvelopeController || null;
    this.log = typeof log === 'function' ? log : () => {};
    this.hoveredObjectId = null;
    this.lastSelectedObjectId = selectionManager?.getSelectedId?.() ?? null;
  }

  getHoveredObjectId() {
    return this.hoveredObjectId;
  }

  setHoveredObject(objectId) {
    const nextObjectId = objectId && this.sceneObjectManager.getObject(objectId) ? objectId : null;
    if (nextObjectId === this.hoveredObjectId) {
      return false;
    }

    const previousObjectId = this.hoveredObjectId;
    this.hoveredObjectId = nextObjectId;

    if (previousObjectId) {
      this.refreshObjectVisualState(previousObjectId);
      this.log(`[SelectableObject] hover left: objectId=${previousObjectId}`);
    }

    if (nextObjectId) {
      this.refreshObjectVisualState(nextObjectId);
      this.log(`[SelectableObject] hover entered: objectId=${nextObjectId}`);
    }

    return true;
  }

  clearHoveredObject() {
    return this.setHoveredObject(null);
  }

  refreshObjectVisualState(objectId) {
    if (!objectId) {
      return false;
    }

    const object = this.sceneObjectManager.getObject(objectId);
    if (!object?.entity) {
      return false;
    }

    const isSelected = this.selectionManager.getSelectedId() === objectId;
    const isHovered = this.hoveredObjectId === objectId;
    const visualState = isSelected ? 'selected' : (isHovered ? 'hovered' : 'normal');

    if (object.type === 'buildingEnvelope') {
      return this.buildingEnvelopeController?.setVisualState?.(
        objectId,
        object.entity,
        object.metadata?.envelope,
        visualState
      ) ?? false;
    }

    return false;
  }

  refreshAllVisualStates() {
    this.sceneObjectManager.getObjects().forEach((object) => {
      this.refreshObjectVisualState(object.id);
    });
  }

  handleSelectionChanged(selectionId) {
    const previousSelectedId = this.lastSelectedObjectId;
    this.lastSelectedObjectId = selectionId ?? null;

    if (previousSelectedId && previousSelectedId !== this.lastSelectedObjectId) {
      this.refreshObjectVisualState(previousSelectedId);
      this.log('[SelectableObject] selection cleared');
    }

    if (this.lastSelectedObjectId) {
      this.refreshObjectVisualState(this.lastSelectedObjectId);
      this.log(`[SelectableObject] selected: objectId=${this.lastSelectedObjectId}`);
    }
  }

  destroy() {
    this.clearHoveredObject();
    this.lastSelectedObjectId = null;
  }
}
