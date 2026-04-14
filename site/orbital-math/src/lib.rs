use wasm_bindgen::prelude::*;

const A0: f64 = 1.0; // Bohr radius (can scale visually)

fn factorial(n: u32) -> f64 {
    (2..=n).fold(1.0, |acc, i| acc * i as f64)
}

// Associated Laguerre Polynomial L_k^alpha(x)
fn laguerre(k: u32, alpha: u32, x: f64) -> f64 {
    (0..=k).fold(0.0, |sum, i| {
        let coeff = (-1_f64).powi(i as i32) * factorial(k + alpha)
            / (factorial(k - i) * factorial(alpha + i) * factorial(i));
        sum + coeff * x.powi(i as i32)
    })
}

// Radial function R_nl(r)
#[wasm_bindgen]
pub fn radial(n: u32, l: u32, r: f64) -> f64 {
    let rho = (2.0 * r) / (n as f64 * A0);
    let norm = ((2.0 / (n as f64 * A0)).powi(3) * factorial(n - l - 1)
        / (2.0 * n as f64 * factorial(n + l)))
    .sqrt();
    norm * (-rho / 2.0).exp() * rho.powi(l as i32) * laguerre(n - l - 1, 2 * l + 1, rho)
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
pub fn spherical_harmonic(l: u32, m: i32, theta: f64, phi: f64) -> f64 {
    let abs_m = m.unsigned_abs();
    let norm = (((2 * l + 1) as f64 / (4.0 * std::f64::consts::PI)) * factorial(l - abs_m)
        / factorial(l + abs_m))
    .sqrt();
    let p = legendre(l, abs_m, theta.cos());

    if m > 0 {
        2.0_f64.sqrt() * norm * p * (m as f64 * phi).cos()
    } else if m < 0 {
        2.0_f64.sqrt() * norm * p * (abs_m as f64 * phi).sin()
    } else {
        norm * p
    }
}

// Full wavefunction
#[wasm_bindgen]
pub fn psi(n: u32, l: u32, m: i32, r: f64, theta: f64, phi: f64) -> f64 {
    radial(n, l, r) * spherical_harmonic(l, m, theta, phi)
}

// Probability density |wavefunction|²
#[wasm_bindgen]
pub fn probability_density(n: u32, l: u32, m: i32, r: f64, theta: f64, phi: f64) -> f64 {
    let val = psi(n, l, m, r, theta, phi);
    val * val
}

// Radial probability P(r)
#[wasm_bindgen]
pub fn radial_probability(n: u32, l: u32, r: f64) -> f64 {
    let r_val = radial(n, l, r);
    r * r * r_val * r_val
}

// Point sampler -- responsible for actually generating all the points to send to the client.
#[wasm_bindgen]
pub fn sample_batch(
    n: u32,
    l: u32,
    m: i32,
    count: u32,
    r_max: f64,
    rejection_scale: f64,
) -> Vec<f32> {
    let mut points = Vec::with_capacity(count as usize * 3);
    let max_attempts = count * 1000;
    let mut attempts = 0;

    while points.len() < (count as usize * 3)
    /* && attempts < max_attempts */
    {
        //attempts += 1;

        let r = js_sys::Math::random() * r_max;
        let theta = (1.0 - 2.0 * js_sys::Math::random()).acos();
        let phi = 2.0 * std::f64::consts::PI * js_sys::Math::random();

        let p = probability_density(n, l, m, r, theta, phi);

        if js_sys::Math::random() < p * rejection_scale {
            let (sin_t, cos_t) = theta.sin_cos();
            let (sin_p, cos_p) = phi.sin_cos();
            points.push((r * sin_t * cos_p) as f32); // x
            points.push((r * sin_t * sin_p) as f32); // y
            points.push((r * cos_t) as f32); // z
        }
    }

    points
}
