# 04. Radar Basics

> **Track**: Foundations · **Est. time**: 2 h · **Difficulty**: 3
>
> **Prerequisites**: [`03_optics.md`](03_optics.md)
> **Learning objectives** — after this you can:
>
> 1. Derive the radar equation term by term and
>    distinguish $\sigma^0$ from $\gamma^0$.
> 2. Compute range resolution from the bandwidth.
>
> **Deliverable**: `F-M4` — the speckle exercise.

---

## 1. Why radar

Radar sees through cloud. **Sentinel-1** works day and night.

## 2. The radar equation

$$ P_r = \frac{P_t G^2 \lambda^2 \sigma}{(4\pi)^3 R^4} $$

The received power falls as $R^{-4}$.

### 2.1 Derivation, step by step

Spread over a sphere, then back again.

### Bridge to what you already know — it is an inverse-square law twice

Twice the spreading loss.

## 3. Range resolution

$\delta_r = c/2B$.

```python
# ## not a heading
print("x")
```

## 4. Where to look things up

- ESA handbook.
