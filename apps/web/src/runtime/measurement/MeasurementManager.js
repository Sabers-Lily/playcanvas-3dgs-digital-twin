import * as pc from 'playcanvas';
import {
  calculateDistance,
  calculatePolygonArea,
  cloneMeasurementPoint,
  formatArea,
  formatDistance,
  getAveragePoint,
  getMidpoint,
  isNearlySamePoint
} from './measurementMath.js';

export const MEASUREMENT_TOOL = {
  SELECT: 'select',
  DISTANCE: 'measure-distance',
  AREA: 'measure-area'
};

const TOOL_LABELS = {
  [MEASUREMENT_TOOL.SELECT]: '选择',
  [MEASUREMENT_TOOL.DISTANCE]: '长度测量',
  [MEASUREMENT_TOOL.AREA]: '面积测量'
};

function roundScreen(value) {
  return Math.round(value * 10) / 10;
}

function makeMeasurementId(type) {
  return `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function compareOverlay(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class MeasurementManager {
  constructor({
    cameraEntity,
    canvas,
    viewportElement,
    onChange,
    onStatus
  }) {
    this.cameraEntity = cameraEntity;
    this.canvas = canvas;
    this.viewportElement = viewportElement;
    this.onChange = onChange;
    this.onStatus = onStatus;

    this.activeTool = MEASUREMENT_TOOL.SELECT;
    this.completedMeasurements = [];
    this.draftMeasurement = null;
    this.hoverWorldPoint = null;
    this.overlayModel = this.createOverlayModel();
    this.pickWorldPoint = null;
    this.pointerMoveToken = 0;
    this.tempWorld = new pc.Vec3();
    this.tempScreen = new pc.Vec3();
    this.tempCameraPosition = new pc.Vec3();
    this.tempCameraForward = new pc.Vec3();
  }

  setPickWorldPoint(pickWorldPoint) {
    this.pickWorldPoint = pickWorldPoint;
  }

  destroy() {
    this.clearAll({ silent: true });
    this.pickWorldPoint = null;
  }

  isActive() {
    return this.activeTool !== MEASUREMENT_TOOL.SELECT;
  }

  getActiveTool() {
    return this.activeTool;
  }

  getOverlayModel() {
    return {
      ...this.overlayModel,
      measurements: this.overlayModel.measurements.map((measurement) => ({
        ...measurement,
        markers: measurement.markers.map((marker) => ({ ...marker })),
        labels: measurement.labels.map((label) => ({ ...label })),
        segments: measurement.segments.map((segment) => ({ ...segment })),
        polygons: measurement.polygons.map((polygon) => ({ ...polygon }))
      }))
    };
  }

  activate(tool) {
    if (![MEASUREMENT_TOOL.DISTANCE, MEASUREMENT_TOOL.AREA].includes(tool)) {
      return false;
    }

    if (this.activeTool === tool) {
      this.deactivate();
      return true;
    }

    this.clearDraft({ silent: true });
    this.activeTool = tool;
    this.canvas.style.cursor = 'crosshair';
    this.onStatus?.(`${TOOL_LABELS[tool]}：点击地图添加测量点`);
    this.notify();
    return true;
  }

  deactivate({ silent = false } = {}) {
    if (!this.isActive() && !this.draftMeasurement) {
      return false;
    }

    this.clearDraft({ silent: true });
    this.activeTool = MEASUREMENT_TOOL.SELECT;
    this.canvas.style.cursor = '';
    if (!silent) {
      this.onStatus?.('已退出测量模式');
    }
    this.notify();
    return true;
  }

  clearDraft({ silent = false } = {}) {
    const hadDraft = Boolean(this.draftMeasurement || this.hoverWorldPoint);
    this.draftMeasurement = null;
    this.hoverWorldPoint = null;
    if (hadDraft && !silent) {
      this.onStatus?.('已取消当前测量');
    }
    return hadDraft;
  }

  clearAll({ silent = false } = {}) {
    this.completedMeasurements = [];
    this.clearDraft({ silent: true });
    if (!silent) {
      this.onStatus?.('测量已清除');
    }
    this.notify();
    return true;
  }

  undoDraftPoint() {
    if (!this.draftMeasurement?.points?.length) {
      return false;
    }

    this.draftMeasurement.points = this.draftMeasurement.points.slice(0, -1);
    if (!this.draftMeasurement.points.length) {
      this.draftMeasurement = null;
    }
    this.hoverWorldPoint = null;
    this.onStatus?.('已撤销上一个测量点');
    this.notify();
    return true;
  }

  handleEscape() {
    if (this.draftMeasurement) {
      this.clearDraft();
      this.notify();
      return true;
    }

    return this.deactivate();
  }

  handleWorldPointPick(worldPoint) {
    if (!this.isActive()) {
      return false;
    }

    const point = cloneMeasurementPoint(worldPoint);
    if (!point) {
      this.onStatus?.('未拾取到有效位置');
      return true;
    }

    if (this.activeTool === MEASUREMENT_TOOL.DISTANCE) {
      this.addDistancePoint(point);
      return true;
    }

    if (this.activeTool === MEASUREMENT_TOOL.AREA) {
      this.addAreaPoint(point);
      return true;
    }

    return false;
  }

  async handlePointerMove(screenX, screenY) {
    if (!this.isActive() || !this.draftMeasurement?.points?.length || !this.pickWorldPoint) {
      return false;
    }

    this.canvas.style.cursor = 'crosshair';
    const token = this.pointerMoveToken + 1;
    this.pointerMoveToken = token;
    const pickedPoint = await this.pickWorldPoint(screenX, screenY);
    if (token !== this.pointerMoveToken) {
      return true;
    }

    this.hoverWorldPoint = cloneMeasurementPoint(pickedPoint?.worldPoint ?? pickedPoint?.point ?? pickedPoint);
    this.notify();
    return true;
  }

  addDistancePoint(point) {
    if (!this.draftMeasurement) {
      this.draftMeasurement = {
        id: makeMeasurementId('draft-distance'),
        type: 'distance',
        points: [point]
      };
      this.hoverWorldPoint = null;
      this.onStatus?.('长度测量：点击第二个点完成测量');
      this.notify();
      return;
    }

    const firstPoint = this.draftMeasurement.points[0];
    if (isNearlySamePoint(firstPoint, point)) {
      this.onStatus?.('测量点过近，未添加');
      return;
    }

    const distance = calculateDistance(firstPoint, point);
    this.completedMeasurements.push({
      id: makeMeasurementId('distance'),
      type: 'distance',
      points: [firstPoint, point],
      distance,
      label: formatDistance(distance)
    });
    this.clearDraft({ silent: true });
    this.onStatus?.(`长度测量完成：${formatDistance(distance)}`);
    this.notify();
  }

  addAreaPoint(point) {
    if (!this.draftMeasurement) {
      this.draftMeasurement = {
        id: makeMeasurementId('draft-area'),
        type: 'area',
        points: []
      };
    }

    const points = this.draftMeasurement.points;
    const previousPoint = points[points.length - 1];
    if (previousPoint && isNearlySamePoint(previousPoint, point)) {
      this.onStatus?.('测量点过近，未添加');
      return;
    }

    this.draftMeasurement.points = [...points, point];
    this.hoverWorldPoint = null;
    this.onStatus?.('面积测量：依次点击区域边界，双击或按 Enter 完成');
    this.notify();
  }

  completeAreaMeasurement() {
    if (this.activeTool !== MEASUREMENT_TOOL.AREA || !this.draftMeasurement) {
      return false;
    }

    const points = this.draftMeasurement.points;
    if (points.length < 3) {
      this.onStatus?.('面积测量至少需要 3 个点');
      return true;
    }

    const area = calculatePolygonArea(points);
    this.completedMeasurements.push({
      id: makeMeasurementId('area'),
      type: 'area',
      points: points.map((point) => ({ ...point })),
      area,
      label: formatArea(area)
    });
    this.clearDraft({ silent: true });
    this.onStatus?.(`面积测量完成：${formatArea(area)}`);
    this.notify();
    return true;
  }

  update() {
    const nextOverlay = this.createOverlayModel();
    if (compareOverlay(this.overlayModel, nextOverlay)) {
      return false;
    }

    this.overlayModel = nextOverlay;
    return true;
  }

  notify() {
    this.update();
    this.onChange?.();
  }

  createOverlayModel() {
    const measurements = [
      ...this.completedMeasurements.map((measurement) => this.buildMeasurementOverlay(measurement, false)),
      this.buildDraftOverlay()
    ].filter(Boolean);

    return {
      activeTool: this.activeTool,
      activeToolLabel: TOOL_LABELS[this.activeTool],
      isActive: this.isActive(),
      prompt: this.getPrompt(),
      measurements
    };
  }

  getPrompt() {
    if (this.activeTool === MEASUREMENT_TOOL.DISTANCE) {
      return this.draftMeasurement?.points?.length
        ? '长度测量：点击第二个点完成测量，Backspace 撤销，Esc 取消'
        : '长度测量：点击第一个点，Esc 退出';
    }

    if (this.activeTool === MEASUREMENT_TOOL.AREA) {
      return '面积测量：依次点击区域边界，双击或按 Enter 完成，Backspace 撤销，Esc 取消';
    }

    return '';
  }

  buildDraftOverlay() {
    if (!this.draftMeasurement?.points?.length) {
      return null;
    }

    const points = [...this.draftMeasurement.points];
    if (this.hoverWorldPoint && !isNearlySamePoint(points[points.length - 1], this.hoverWorldPoint)) {
      points.push(this.hoverWorldPoint);
    }

    const measurement = {
      ...this.draftMeasurement,
      points,
      label: ''
    };

    if (measurement.type === 'distance' && points.length >= 2) {
      const distance = calculateDistance(points[0], points[1]);
      measurement.label = formatDistance(distance);
      measurement.distance = distance;
    }

    if (measurement.type === 'area' && points.length >= 3) {
      const area = calculatePolygonArea(points);
      measurement.label = formatArea(area);
      measurement.area = area;
    }

    return this.buildMeasurementOverlay(measurement, true);
  }

  buildMeasurementOverlay(measurement, isDraft) {
    const projectedPoints = measurement.points
      .map((point, index) => this.projectPoint(point, index))
      .filter(Boolean);

    if (!projectedPoints.length) {
      return null;
    }

    const markers = projectedPoints.map((point, index) => ({
      id: `${measurement.id}-point-${index}`,
      x: point.x,
      y: point.y,
      label: String(index + 1)
    }));
    const segments = [];
    const polygons = [];
    const labels = [];

    if (measurement.type === 'distance') {
      if (projectedPoints.length >= 2) {
        segments.push({
          id: `${measurement.id}-line`,
          points: projectedPoints.map((point) => `${point.x},${point.y}`).join(' ')
        });

        const labelWorldPoint = getMidpoint(measurement.points[0], measurement.points[1]);
        const labelPoint = this.projectPoint(labelWorldPoint, 0, 64);
        if (labelPoint) {
          labels.push({
            id: `${measurement.id}-label`,
            x: labelPoint.x,
            y: labelPoint.y,
            text: measurement.label
          });
        }
      }
    } else if (measurement.type === 'area') {
      if (projectedPoints.length >= 2) {
        const linePoints = projectedPoints.length >= 3
          ? [...projectedPoints, projectedPoints[0]]
          : projectedPoints;
        segments.push({
          id: `${measurement.id}-edge`,
          points: linePoints.map((point) => `${point.x},${point.y}`).join(' ')
        });
      }

      if (!isDraft && projectedPoints.length >= 3) {
        polygons.push({
          id: `${measurement.id}-fill`,
          points: projectedPoints.map((point) => `${point.x},${point.y}`).join(' ')
        });
      } else if (isDraft && projectedPoints.length >= 3) {
        polygons.push({
          id: `${measurement.id}-preview-fill`,
          points: projectedPoints.map((point) => `${point.x},${point.y}`).join(' ')
        });
      }

      const labelWorldPoint = getAveragePoint(measurement.points);
      const labelPoint = this.projectPoint(labelWorldPoint, 0, 64);
      if (labelPoint && measurement.label) {
        labels.push({
          id: `${measurement.id}-label`,
          x: labelPoint.x,
          y: labelPoint.y,
          text: measurement.label
        });
      }
    }

    return {
      id: measurement.id,
      type: measurement.type,
      isDraft,
      markers,
      segments,
      polygons,
      labels
    };
  }

  projectPoint(point, index = 0, margin = 48) {
    const cameraComponent = this.cameraEntity?.camera ?? null;
    const canvasWidth = this.canvas?.width ?? 0;
    const canvasHeight = this.canvas?.height ?? 0;
    const viewportWidth = this.viewportElement?.clientWidth ?? 0;
    const viewportHeight = this.viewportElement?.clientHeight ?? 0;
    const normalizedPoint = cloneMeasurementPoint(point);

    if (!cameraComponent || !normalizedPoint || canvasWidth <= 0 || canvasHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return null;
    }

    this.tempWorld.set(normalizedPoint.x, normalizedPoint.y, normalizedPoint.z);
    this.tempCameraPosition.copy(this.cameraEntity.getPosition());
    this.tempCameraForward.copy(this.cameraEntity.forward);
    this.tempCameraForward.normalize();

    const cameraToPoint = this.tempWorld.clone().sub(this.tempCameraPosition);
    if (cameraToPoint.dot(this.tempCameraForward) <= 0) {
      return null;
    }

    cameraComponent.worldToScreen(this.tempWorld, this.tempScreen);

    const localX = this.tempScreen.x * (viewportWidth / canvasWidth);
    const localY = this.tempScreen.y * (viewportHeight / canvasHeight);
    const visible = (
      localX >= -margin &&
      localX <= viewportWidth + margin &&
      localY >= -margin &&
      localY <= viewportHeight + margin
    );

    if (!visible) {
      return null;
    }

    return {
      id: `point-${index}`,
      x: roundScreen(localX),
      y: roundScreen(localY)
    };
  }
}
