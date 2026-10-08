import * as THREE from 'three';

type LegNodes = { thigh?: THREE.Object3D; shin?: THREE.Object3D; foot?: THREE.Object3D };

type Planted = {
  thigh: THREE.Object3D;
  shin: THREE.Object3D;
  foot: THREE.Object3D;
  /** Longueurs cuisse et jambe, et position / orientation de la patte au repos (repère de `root`). */
  l1: number;
  l2: number;
  footPos: THREE.Vector3;
  footQuat: THREE.Quaternion;
  /** Sens du genou au repos (perpendiculaire à l'axe hanche → patte). */
  pole: THREE.Vector3;
  thighQ0: THREE.Quaternion;
  shinQ0: THREE.Quaternion;
  /** Direction cuisse → genou dans le repère du corps, et genou → patte dans celui de la cuisse, au repos. */
  v1: THREE.Vector3;
  v2: THREE.Vector3;
};

/**
 * Garde les pattes posées : quand le corps tourne ou s'incline, la patte reste exactement où elle était
 * et seules la cuisse et la jambe pivotent autour de leurs rotules (hanche, genou) pour l'atteindre
 * (cinématique inverse à deux segments). À appeler après chaque mouvement du corps.
 */
export const createLegPlanter = (root: THREE.Object3D, legs: LegNodes[]): (() => void) => {
  root.updateMatrixWorld(true);
  const rootQ = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const posIn = (o: THREE.Object3D): THREE.Vector3 =>
    root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  const quatIn = (o: THREE.Object3D): THREE.Quaternion => {
    root.getWorldQuaternion(rootQ);
    return rootQ.clone().invert().multiply(o.getWorldQuaternion(q));
  };

  const planted: Planted[] = [];
  for (const lg of legs) {
    const { thigh, shin, foot } = lg;
    if (!thigh || !shin || !foot || !thigh.parent) continue;
    const hip = posIn(thigh);
    const knee = posIn(shin);
    const ankle = posIn(foot);
    const l1 = hip.distanceTo(knee);
    const l2 = knee.distanceTo(ankle);
    if (l1 < 1e-4 || l2 < 1e-4) continue;
    const axis = ankle.clone().sub(hip).normalize();
    const pole = knee.clone().sub(hip);
    pole.addScaledVector(axis, -pole.dot(axis));
    if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1).addScaledVector(axis, -axis.z);
    pole.normalize();
    const parentQ = quatIn(thigh.parent);
    const thighQ = quatIn(thigh);
    planted.push({
      thigh,
      shin,
      foot,
      l1,
      l2,
      footPos: ankle,
      footQuat: quatIn(foot),
      pole,
      thighQ0: thigh.quaternion.clone(),
      shinQ0: shin.quaternion.clone(),
      v1: knee.clone().sub(hip).normalize().applyQuaternion(parentQ.clone().invert()),
      v2: ankle.clone().sub(knee).normalize().applyQuaternion(thighQ.clone().invert()),
    });
  }

  const hip = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const knee = new THREE.Vector3();
  const side = new THREE.Vector3();
  const want = new THREE.Vector3();

  return () => {
    if (!planted.length) return;
    root.updateMatrixWorld(true);
    for (const p of planted) {
      hip.copy(posIn(p.thigh));
      dir.copy(p.footPos).sub(hip);
      const d = THREE.MathUtils.clamp(
        dir.length(),
        Math.abs(p.l1 - p.l2) + 1e-3,
        p.l1 + p.l2 - 1e-3,
      );
      dir.normalize();
      // genou : à la distance a de la hanche sur l'axe, décalé de h du côté du genou au repos
      const a = (p.l1 * p.l1 - p.l2 * p.l2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, p.l1 * p.l1 - a * a));
      side.copy(p.pole).addScaledVector(dir, -p.pole.dot(dir)).normalize();
      knee.copy(hip).addScaledVector(dir, a).addScaledVector(side, h);

      // cuisse : de la hanche vers le genou
      const parentQ = quatIn(p.thigh.parent!);
      want.copy(knee).sub(hip).normalize().applyQuaternion(parentQ.clone().invert());
      p.thigh.quaternion.copy(q.setFromUnitVectors(p.v1, want)).multiply(p.thighQ0);
      // jambe : du genou vers la patte
      const thighQ = parentQ.clone().multiply(p.thigh.quaternion);
      want.copy(p.footPos).sub(knee).normalize().applyQuaternion(thighQ.clone().invert());
      p.shin.quaternion.copy(q.setFromUnitVectors(p.v2, want)).multiply(p.shinQ0);
      // patte : garde son orientation d'origine
      const shinQ = thighQ.multiply(p.shin.quaternion);
      p.foot.quaternion.copy(shinQ.invert()).multiply(p.footQuat);
    }
  };
};
