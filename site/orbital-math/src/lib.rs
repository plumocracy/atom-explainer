use wasm_bindgen::prelude::*;

const A0: f64 = 1.0; // Bohr radius (can scale visually)
const TAU: f64 = 2.0 * std::f64::consts::PI;
const RNG_SCALE: f64 = 1.0 / ((1_u64 << 53) as f64);
const AUTO_SCALE_TARGET: f64 = 0.9;
const AUTO_SCALE_PROBES: usize = 4096;
const HBAR_OVER_MASS: f64 = 1.0;
const CARTESIAN_EPSILON: f64 = 1e-9;

#[derive(Clone, Copy, Debug, Default)]
struct Complex {
    re: f64,
    im: f64,
}

impl Complex {
    fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }

    fn conj(self) -> Self {
        Self::new(self.re, -self.im)
    }

    fn scale(self, factor: f64) -> Self {
        Self::new(self.re * factor, self.im * factor)
    }

    fn mul(self, other: Self) -> Self {
        Self::new(
            self.re * other.re - self.im * other.im,
            self.re * other.im + self.im * other.re,
        )
    }

    fn norm_sqr(self) -> f64 {
        self.re * self.re + self.im * self.im
    }
}

fn factorial(n: u32) -> f64 {
    (2..=n).fold(1.0, |acc, i| acc * i as f64)
}

// Associated Laguerre Polynomial L_k^alpha(x)
fn laguerre(k: u32, alpha: u32, x: f64) -> f64 {
    if k == 0 {
        return 1.0;
    }

    let alpha_f = alpha as f64;
    if k == 1 {
        return 1.0 + alpha_f - x;
    }

    let mut l_prev_prev = 1.0;
    let mut l_prev = 1.0 + alpha_f - x;

    for n in 2..=k {
        let n_f = n as f64;
        let l_curr =
            ((2.0 * n_f - 1.0 + alpha_f - x) * l_prev - (n_f - 1.0 + alpha_f) * l_prev_prev) / n_f;
        l_prev_prev = l_prev;
        l_prev = l_curr;
    }

    l_prev
}

struct XorShift64 {
    state: u64,
}

impl XorShift64 {
    fn new(seed: u64) -> Self {
        // xorshift requires a non-zero state
        let state = if seed == 0 {
            0x9e37_79b9_7f4a_7c15
        } else {
            seed
        };
        Self { state }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    fn next_f64(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64) * RNG_SCALE
    }
}

struct RadialSampler {
    rho_scale: f64,
    norm: f64,
    l: i32,
    laguerre_k: u32,
    laguerre_alpha: u32,
}

impl RadialSampler {
    fn new(n: u32, l: u32) -> Self {
        if n == 0 || l >= n {
            return Self {
                rho_scale: 0.0,
                norm: 0.0,
                l: 0,
                laguerre_k: 0,
                laguerre_alpha: 0,
            };
        }

        let n_f = n as f64;
        let rho_scale = 2.0 / (n_f * A0);
        let norm =
            (rho_scale.powi(3) * factorial(n - l - 1) / (2.0 * n_f * factorial(n + l))).sqrt();

        Self {
            rho_scale,
            norm,
            l: l as i32,
            laguerre_k: n - l - 1,
            laguerre_alpha: 2 * l + 1,
        }
    }

    fn value(&self, r: f64) -> f64 {
        let rho = r * self.rho_scale;
        self.norm
            * (-rho * 0.5).exp()
            * rho.powi(self.l)
            * laguerre(self.laguerre_k, self.laguerre_alpha, rho)
    }
}

struct AngularSampler {
    l: u32,
    abs_m: u32,
    norm: f64,
}

impl AngularSampler {
    fn new(l: u32, m: i32) -> Self {
        let abs_m = m.unsigned_abs();

        if abs_m > l {
            return Self {
                l,
                abs_m,
                norm: 0.0,
            };
        }

        let norm = ((((2 * l + 1) as f64) / (4.0 * std::f64::consts::PI)) * factorial(l - abs_m)
            / factorial(l + abs_m))
        .sqrt();

        Self { l, abs_m, norm }
    }
}

fn complex_probability_density_cached(
    radial_sampler: &RadialSampler,
    angular_sampler: &AngularSampler,
    r: f64,
    cos_theta: f64,
) -> f64 {
    let radial_val = radial_sampler.value(r);
    let angular_val =
        angular_sampler.norm * legendre(angular_sampler.l, angular_sampler.abs_m, cos_theta);
    radial_val * radial_val * angular_val * angular_val
}

fn estimate_complex_probability_peak(
    radial_sampler: &RadialSampler,
    angular_sampler: &AngularSampler,
    r_max: f64,
    rng: &mut XorShift64,
) -> f64 {
    let mut max_p = 0.0;

    for _ in 0..AUTO_SCALE_PROBES {
        let r = rng.next_f64() * r_max;
        let cos_t = 1.0 - 2.0 * rng.next_f64();
        let p = complex_probability_density_cached(radial_sampler, angular_sampler, r, cos_t);
        if p > max_p {
            max_p = p;
        }
    }

    max_p
}

fn cartesian_to_spherical(x: f64, y: f64, z: f64) -> (f64, f64, f64) {
    let r = (x * x + y * y + z * z).sqrt();
    if r <= CARTESIAN_EPSILON {
        return (0.0, 0.0, 0.0);
    }

    let theta = (z / r).clamp(-1.0, 1.0).acos();
    let phi = y.atan2(x);
    (r, theta, phi)
}

fn complex_spherical_harmonic_value(l: u32, m: i32, theta: f64, phi: f64) -> Complex {
    let abs_m = m.unsigned_abs();
    if abs_m > l {
        return Complex::default();
    }

    let p = legendre(l, abs_m, theta.cos());
    let norm = ((((2 * l + 1) as f64) / (4.0 * std::f64::consts::PI)) * factorial(l - abs_m)
        / factorial(l + abs_m))
    .sqrt();
    let amplitude = norm * p;
    let angle = m as f64 * phi;
    let (sin_phi, cos_phi) = angle.sin_cos();
    Complex::new(amplitude * cos_phi, amplitude * sin_phi)
}

fn complex_psi_value(n: u32, l: u32, m: i32, r: f64, theta: f64, phi: f64) -> Complex {
    complex_spherical_harmonic_value(l, m, theta, phi).scale(radial(n, l, r))
}

fn complex_psi_cartesian_value(n: u32, l: u32, m: i32, x: f64, y: f64, z: f64) -> Complex {
    let (r, theta, phi) = cartesian_to_spherical(x, y, z);
    complex_psi_value(n, l, m, r, theta, phi)
}

fn effective_gradient_step(step: f64, x: f64, y: f64, z: f64) -> f64 {
    if step.is_finite() && step > 0.0 {
        return step;
    }

    let scale = x.abs().max(y.abs()).max(z.abs()).max(1.0);
    1e-3 * scale
}

fn current_density_cartesian(
    n: u32,
    l: u32,
    m: i32,
    x: f64,
    y: f64,
    z: f64,
    step: f64,
) -> ([f64; 3], f64) {
    let h = effective_gradient_step(step, x, y, z);
    let psi = complex_psi_cartesian_value(n, l, m, x, y, z);
    let rho = psi.norm_sqr();

    if rho <= 0.0 {
        return ([0.0, 0.0, 0.0], 0.0);
    }

    let grad_x = {
        let plus = complex_psi_cartesian_value(n, l, m, x + h, y, z);
        let minus = complex_psi_cartesian_value(n, l, m, x - h, y, z);
        Complex::new(
            (plus.re - minus.re) / (2.0 * h),
            (plus.im - minus.im) / (2.0 * h),
        )
    };
    let grad_y = {
        let plus = complex_psi_cartesian_value(n, l, m, x, y + h, z);
        let minus = complex_psi_cartesian_value(n, l, m, x, y - h, z);
        Complex::new(
            (plus.re - minus.re) / (2.0 * h),
            (plus.im - minus.im) / (2.0 * h),
        )
    };
    let grad_z = {
        let plus = complex_psi_cartesian_value(n, l, m, x, y, z + h);
        let minus = complex_psi_cartesian_value(n, l, m, x, y, z - h);
        Complex::new(
            (plus.re - minus.re) / (2.0 * h),
            (plus.im - minus.im) / (2.0 * h),
        )
    };

    let psi_conj = psi.conj();
    let current = [
        HBAR_OVER_MASS * psi_conj.mul(grad_x).im,
        HBAR_OVER_MASS * psi_conj.mul(grad_y).im,
        HBAR_OVER_MASS * psi_conj.mul(grad_z).im,
    ];

    (current, rho)
}

fn clamp_velocity(current: [f64; 3], rho: f64, velocity_cap: f64) -> [f64; 3] {
    if rho <= 1e-12 {
        return [0.0, 0.0, 0.0];
    }

    let mut velocity = [current[0] / rho, current[1] / rho, current[2] / rho];
    let speed =
        (velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]).sqrt();
    if velocity_cap.is_finite() && velocity_cap > 0.0 && speed > velocity_cap {
        let scale = velocity_cap / speed;
        velocity[0] *= scale;
        velocity[1] *= scale;
        velocity[2] *= scale;
    }

    for component in &mut velocity {
        if !component.is_finite() || component.abs() < 1e-10 {
            *component = 0.0;
        }
    }

    velocity
}

fn flow_velocity_at(
    n: u32,
    l: u32,
    m: i32,
    x: f64,
    y: f64,
    z: f64,
    velocity_cap: f64,
) -> ([f64; 3], f64) {
    let (current, rho) = current_density_cartesian(n, l, m, x, y, z, 1e-3);
    (clamp_velocity(current, rho, velocity_cap), rho)
}

fn rk4_step_complex_flow(
    n: u32,
    l: u32,
    m: i32,
    x: f64,
    y: f64,
    z: f64,
    dt: f64,
    velocity_cap: f64,
) -> ([f64; 3], [f64; 3], f64) {
    let (k1, rho1) = flow_velocity_at(n, l, m, x, y, z, velocity_cap);

    let x2 = x + 0.5 * dt * k1[0];
    let y2 = y + 0.5 * dt * k1[1];
    let z2 = z + 0.5 * dt * k1[2];
    let (k2, _) = flow_velocity_at(n, l, m, x2, y2, z2, velocity_cap);

    let x3 = x + 0.5 * dt * k2[0];
    let y3 = y + 0.5 * dt * k2[1];
    let z3 = z + 0.5 * dt * k2[2];
    let (k3, _) = flow_velocity_at(n, l, m, x3, y3, z3, velocity_cap);

    let x4 = x + dt * k3[0];
    let y4 = y + dt * k3[1];
    let z4 = z + dt * k3[2];
    let (k4, _) = flow_velocity_at(n, l, m, x4, y4, z4, velocity_cap);

    let next_x = x + (dt / 6.0) * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0]);
    let next_y = y + (dt / 6.0) * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1]);
    let next_z = z + (dt / 6.0) * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2]);
    let (next_velocity, next_rho) = flow_velocity_at(n, l, m, next_x, next_y, next_z, velocity_cap);

    ([next_x, next_y, next_z], next_velocity, rho1.min(next_rho))
}

fn sample_complex_flow_particle(
    radial_sampler: &RadialSampler,
    angular_sampler: &AngularSampler,
    n: u32,
    l: u32,
    m: i32,
    r_max: f64,
    rejection_scale: f64,
    velocity_cap: f64,
    rng: &mut XorShift64,
) -> [f32; 6] {
    let mut tuned_scale = rejection_scale;

    loop {
        let r = rng.next_f64() * r_max;
        let cos_t = 1.0 - 2.0 * rng.next_f64();
        let sin_t = (1.0 - cos_t * cos_t).max(0.0).sqrt();
        let phi = TAU * rng.next_f64();

        let p = complex_probability_density_cached(radial_sampler, angular_sampler, r, cos_t);
        let accept_prob = p * tuned_scale;
        if accept_prob >= 1.0 {
            tuned_scale = AUTO_SCALE_TARGET / p;
            continue;
        }

        if rng.next_f64() < accept_prob {
            let (sin_p, cos_p) = phi.sin_cos();
            let x = r * sin_t * cos_p;
            let y = r * sin_t * sin_p;
            let z = r * cos_t;
            let (velocity, _) = flow_velocity_at(n, l, m, x, y, z, velocity_cap);
            return [
                x as f32,
                y as f32,
                z as f32,
                velocity[0] as f32,
                velocity[1] as f32,
                velocity[2] as f32,
            ];
        }
    }
}

#[wasm_bindgen]
pub fn auto_rejection_scale_complex(n: u32, l: u32, m: i32, r_max: f64, scale_cap: f64) -> f64 {
    if r_max <= 0.0 {
        return 0.0;
    }

    let radial_sampler = RadialSampler::new(n, l);
    let angular_sampler = AngularSampler::new(l, m);
    if radial_sampler.norm == 0.0 || angular_sampler.norm == 0.0 {
        return 0.0;
    }

    let seed = ((js_sys::Math::random() * u64::MAX as f64) as u64)
        ^ ((n as u64) << 32)
        ^ ((l as u64) << 16)
        ^ (m as i64 as u64)
        ^ 0x9e37_79b9;
    let mut rng = XorShift64::new(seed);

    let max_p_estimate =
        estimate_complex_probability_peak(&radial_sampler, &angular_sampler, r_max, &mut rng);
    if max_p_estimate <= 0.0 {
        return 0.0;
    }

    let mut scale = AUTO_SCALE_TARGET / max_p_estimate;
    if scale_cap.is_finite() && scale_cap > 0.0 {
        scale = scale.min(scale_cap);
    }

    scale
}

// Radial function R_nl(r)
pub fn radial(n: u32, l: u32, r: f64) -> f64 {
    if n == 0 || l >= n {
        return 0.0;
    }

    RadialSampler::new(n, l).value(r)
}

// Spherical Harmonics Y_l^m
// (Real-valued versions for rendering)
fn legendre(l: u32, m: u32, x: f64) -> f64 {
    if m > l {
        return 0.0;
    }

    let mut pmm = 1.0_f64;
    if m > 0 {
        let somx2 = ((1.0 - x) * (1.0 + x)).sqrt();
        let mut fact = 1.0_f64;
        for _ in 1..=m {
            pmm *= -fact * somx2;
            fact += 2.0;
        }
    }

    if l == m {
        return pmm;
    }

    let mut pmmp1 = x * (2 * m + 1) as f64 * pmm;
    if l == m + 1 {
        return pmmp1;
    }

    let mut pll = 0.0;
    for ll in (m + 2)..=l {
        pll = ((2 * ll - 1) as f64 * x * pmmp1 - (ll + m - 1) as f64 * pmm) / (ll - m) as f64;
        pmm = pmmp1;
        pmmp1 = pll;
    }
    pll
}

#[wasm_bindgen]
pub fn sample_batch_complex_flow(
    n: u32,
    l: u32,
    m: i32,
    count: u32,
    r_max: f64,
    rejection_scale: f64,
) -> Vec<f32> {
    if count == 0 || r_max <= 0.0 || rejection_scale <= 0.0 {
        return Vec::new();
    }

    let radial_sampler = RadialSampler::new(n, l);
    let angular_sampler = AngularSampler::new(l, m);
    if radial_sampler.norm == 0.0 || angular_sampler.norm == 0.0 {
        return Vec::new();
    }

    let target_len = count as usize * 6;
    let mut samples = Vec::with_capacity(target_len);

    let seed = ((js_sys::Math::random() * u64::MAX as f64) as u64)
        ^ ((n as u64) << 32)
        ^ ((l as u64) << 16)
        ^ (m as i64 as u64)
        ^ (count as u64)
        ^ 0x517c_c1b7;
    let mut rng = XorShift64::new(seed);
    let mut tuned_scale = rejection_scale;

    while samples.len() < target_len {
        let r = rng.next_f64() * r_max;
        let cos_t = 1.0 - 2.0 * rng.next_f64();
        let sin_t = (1.0 - cos_t * cos_t).max(0.0).sqrt();
        let phi = TAU * rng.next_f64();

        let p = complex_probability_density_cached(&radial_sampler, &angular_sampler, r, cos_t);
        let accept_prob = p * tuned_scale;
        if accept_prob >= 1.0 {
            samples.clear();
            tuned_scale = AUTO_SCALE_TARGET / p;
            continue;
        }

        if rng.next_f64() < accept_prob {
            let (sin_p, cos_p) = phi.sin_cos();
            let x = r * sin_t * cos_p;
            let y = r * sin_t * sin_p;
            let z = r * cos_t;

            let (current, rho) = current_density_cartesian(n, l, m, x, y, z, 1e-3);
            let velocity = clamp_velocity(current, rho, 24.0);

            samples.push(x as f32);
            samples.push(y as f32);
            samples.push(z as f32);
            samples.push(velocity[0] as f32);
            samples.push(velocity[1] as f32);
            samples.push(velocity[2] as f32);
        }
    }

    samples
}

#[wasm_bindgen]
pub fn advance_batch_complex_flow(
    n: u32,
    l: u32,
    m: i32,
    positions: Vec<f32>,
    dt: f64,
    r_max: f64,
    rejection_scale: f64,
) -> Vec<f32> {
    if positions.is_empty() || positions.len() % 3 != 0 || r_max <= 0.0 || rejection_scale <= 0.0 {
        return Vec::new();
    }

    let radial_sampler = RadialSampler::new(n, l);
    let angular_sampler = AngularSampler::new(l, m);
    if radial_sampler.norm == 0.0 || angular_sampler.norm == 0.0 {
        return Vec::new();
    }

    let target_len = (positions.len() / 3) * 6;
    let mut samples = Vec::with_capacity(target_len);
    let step_dt = if dt.is_finite() { dt.max(0.0) } else { 0.0 };
    let respawn_radius = r_max * 1.1;
    let seed = ((js_sys::Math::random() * u64::MAX as f64) as u64)
        ^ ((n as u64) << 32)
        ^ ((l as u64) << 16)
        ^ (m as i64 as u64)
        ^ 0xa5a5_1f3d;
    let mut rng = XorShift64::new(seed);

    for idx in (0..positions.len()).step_by(3) {
        let x = positions[idx] as f64;
        let y = positions[idx + 1] as f64;
        let z = positions[idx + 2] as f64;

        if !x.is_finite() || !y.is_finite() || !z.is_finite() {
            samples.extend_from_slice(&sample_complex_flow_particle(
                &radial_sampler,
                &angular_sampler,
                n,
                l,
                m,
                r_max,
                rejection_scale,
                24.0,
                &mut rng,
            ));
            continue;
        }

        let ([next_x, next_y, next_z], next_velocity, rho) =
            rk4_step_complex_flow(n, l, m, x, y, z, step_dt, 24.0);
        let next_radius = (next_x * next_x + next_y * next_y + next_z * next_z).sqrt();

        if rho <= 1e-12
            || !next_x.is_finite()
            || !next_y.is_finite()
            || !next_z.is_finite()
            || next_radius > respawn_radius
        {
            samples.extend_from_slice(&sample_complex_flow_particle(
                &radial_sampler,
                &angular_sampler,
                n,
                l,
                m,
                r_max,
                rejection_scale,
                24.0,
                &mut rng,
            ));
            continue;
        }

        samples.push(next_x as f32);
        samples.push(next_y as f32);
        samples.push(next_z as f32);
        samples.push(next_velocity[0] as f32);
        samples.push(next_velocity[1] as f32);
        samples.push(next_velocity[2] as f32);
    }

    samples
}
