export class SelectionManager {
  constructor(sceneObjectManager, initialSelection = null) {
    this.sceneObjectManager = sceneObjectManager;
    this.selection = null;
    this.listeners = new Set();

    this.sceneObjectManager.onChange(() => {
      if (this.selection && !this.sceneObjectManager.getObject(this.selection)) {
        this.clear();
      }
    });

    if (initialSelection) {
      this.select(initialSelection);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onChange(listener) {
    return this.subscribe(listener);
  }

  emit() {
    this.listeners.forEach((listener) => listener(this.selection, this.getSelectedSnapshot()));
  }

  select(objectId) {
    if (!objectId || !this.sceneObjectManager.getObject(objectId)) {
      return false;
    }

    this.selection = objectId;
    this.emit();
    return true;
  }

  clear() {
    this.selection = null;
    this.emit();
  }

  getSelection() {
    return this.selection;
  }

  getSelectedId() {
    return this.selection;
  }

  getSelectedObject() {
    return this.selection ? this.sceneObjectManager.getObject(this.selection) : null;
  }

  getSelectedSnapshot() {
    return this.selection ? this.sceneObjectManager.getObjectSnapshot(this.selection) : null;
  }
}
