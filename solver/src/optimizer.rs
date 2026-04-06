//! Nelder-Mead simplex optimizer for multi-way crossover tuning.
//!
//! Minimizes the sum-of-squared-error between the simulated system SPL
//! and a target curve over a user-defined frequency range.
//!
//! Optimizable parameters: per-way active filter frequencies, per-way
//! gain (dB), and per-way delay (s).
//!
//! Reference: Nelder, J.A. & Mead, R. "A Simplex Method for Function
//! Minimization" (Computer Journal, 1965)

use crate::system::{solve_system, SpeakerProject};
use crate::crossover::ActiveFilter;

/// Which parameter to optimize.
#[derive(Debug, Clone)]
pub enum OptParam {
    /// Active filter frequency for way[way_idx].active_filters[filter_idx]
    FilterFreq { way_idx: usize, filter_idx: usize },
    /// Per-way gain in dB
    WayGain { way_idx: usize },
    /// Per-way delay in seconds
    WayDelay { way_idx: usize },
}

/// Optimizer configuration.
#[derive(Debug, Clone)]
pub struct OptimizerConfig {
    /// Parameters to optimize
    pub params: Vec<OptParam>,
    /// Target SPL (dB) — flat line or shaped curve
    pub target_db: f64,
    /// Frequency range for cost function (Hz)
    pub freq_min_hz: f64,
    pub freq_max_hz: f64,
    /// Maximum iterations
    pub max_iterations: usize,
    /// Convergence threshold (stop if cost improvement < this)
    pub tolerance: f64,
}

/// Optimizer result.
#[derive(Debug, Clone)]
pub struct OptimizerResult {
    /// Optimized parameter values (same order as config.params)
    pub values: Vec<f64>,
    /// Final cost (sum of squared error)
    pub final_cost: f64,
    /// Number of iterations used
    pub iterations: usize,
    /// Cost at each iteration (for plotting convergence)
    pub cost_history: Vec<f64>,
}

/// Extract current values of optimizable parameters from the project.
fn extract_values(project: &SpeakerProject, params: &[OptParam]) -> Vec<f64> {
    params.iter().map(|p| match p {
        OptParam::FilterFreq { way_idx, filter_idx } => {
            let filter = &project.ways[*way_idx].active_filters[*filter_idx];
            match filter {
                ActiveFilter::LowPass1 { freq_hz } |
                ActiveFilter::HighPass1 { freq_hz } |
                ActiveFilter::LR4LowPass { freq_hz } |
                ActiveFilter::LR4HighPass { freq_hz } |
                ActiveFilter::LR2LowPass { freq_hz } |
                ActiveFilter::LR2HighPass { freq_hz } |
                ActiveFilter::AllPass1 { freq_hz } => *freq_hz,
                ActiveFilter::LowPass2 { freq_hz, .. } |
                ActiveFilter::HighPass2 { freq_hz, .. } |
                ActiveFilter::PEQ { freq_hz, .. } |
                ActiveFilter::AllPass2 { freq_hz, .. } |
                ActiveFilter::ShelfLow { freq_hz, .. } |
                ActiveFilter::ShelfHigh { freq_hz, .. } => *freq_hz,
                ActiveFilter::LinkwitzTransform { fp, .. } => *fp,
                ActiveFilter::Gain { db } => *db,
                ActiveFilter::Invert => 0.0,
            }
        }
        OptParam::WayGain { way_idx } => project.ways[*way_idx].gain_db,
        OptParam::WayDelay { way_idx } => project.ways[*way_idx].delay_s,
    }).collect()
}

/// Apply parameter values back into the project (public for WASM API).
pub fn apply_values_pub(project: &mut SpeakerProject, params: &[OptParam], values: &[f64]) {
    apply_values(project, params, values);
}

/// Apply parameter values back into the project.
fn apply_values(project: &mut SpeakerProject, params: &[OptParam], values: &[f64]) {
    for (p, &v) in params.iter().zip(values.iter()) {
        match p {
            OptParam::FilterFreq { way_idx, filter_idx } => {
                let filter = &mut project.ways[*way_idx].active_filters[*filter_idx];
                let freq = v.max(10.0); // clamp to minimum 10 Hz
                match filter {
                    ActiveFilter::LowPass1 { freq_hz } |
                    ActiveFilter::HighPass1 { freq_hz } |
                    ActiveFilter::LR4LowPass { freq_hz } |
                    ActiveFilter::LR4HighPass { freq_hz } |
                    ActiveFilter::LR2LowPass { freq_hz } |
                    ActiveFilter::LR2HighPass { freq_hz } |
                    ActiveFilter::AllPass1 { freq_hz } => *freq_hz = freq,
                    ActiveFilter::LowPass2 { freq_hz, .. } |
                    ActiveFilter::HighPass2 { freq_hz, .. } |
                    ActiveFilter::PEQ { freq_hz, .. } |
                    ActiveFilter::AllPass2 { freq_hz, .. } |
                    ActiveFilter::ShelfLow { freq_hz, .. } |
                    ActiveFilter::ShelfHigh { freq_hz, .. } => *freq_hz = freq,
                    ActiveFilter::LinkwitzTransform { fp, .. } => *fp = freq,
                    ActiveFilter::Gain { db } => *db = v,
                    ActiveFilter::Invert => {}
                }
            }
            OptParam::WayGain { way_idx } => {
                project.ways[*way_idx].gain_db = v.clamp(-20.0, 20.0);
            }
            OptParam::WayDelay { way_idx } => {
                project.ways[*way_idx].delay_s = v.max(0.0);
            }
        }
    }
}

/// Cost function: sum of squared error between system SPL and target.
fn cost(project: &SpeakerProject, target_db: f64, freq_min: f64, freq_max: f64) -> f64 {
    let result = match solve_system(project) {
        Ok(r) => r,
        Err(_) => return 1e12,
    };

    let mut total = 0.0;
    let mut count = 0;
    for (i, &f) in result.frequencies_hz.iter().enumerate() {
        if f >= freq_min && f <= freq_max {
            let err = result.system_spl_db[i] - target_db;
            total += err * err;
            count += 1;
        }
    }
    if count > 0 { total / count as f64 } else { 1e12 }
}

/// Run Nelder-Mead optimization on a speaker project.
pub fn optimize(
    project: &SpeakerProject,
    config: &OptimizerConfig,
) -> OptimizerResult {
    let n = config.params.len();
    if n == 0 {
        return OptimizerResult { values: vec![], final_cost: 0.0, iterations: 0, cost_history: vec![] };
    }

    let initial = extract_values(project, &config.params);

    // Initialize simplex: n+1 vertices
    let mut simplex: Vec<Vec<f64>> = Vec::with_capacity(n + 1);
    simplex.push(initial.clone());
    for i in 0..n {
        let mut v = initial.clone();
        let step = if v[i].abs() > 1.0 { v[i] * 0.1 } else { 1.0 };
        v[i] += step;
        simplex.push(v);
    }

    // Evaluate cost at each vertex
    let mut costs: Vec<f64> = simplex.iter().map(|v| {
        let mut p = project.clone();
        apply_values(&mut p, &config.params, v);
        cost(&p, config.target_db, config.freq_min_hz, config.freq_max_hz)
    }).collect();

    let mut cost_history = Vec::new();
    let alpha = 1.0;  // reflection
    let gamma = 2.0;  // expansion
    let rho = 0.5;    // contraction
    let sigma = 0.5;  // shrink

    for iteration in 0..config.max_iterations {
        // Sort by cost
        let mut order: Vec<usize> = (0..=n).collect();
        order.sort_by(|&a, &b| costs[a].partial_cmp(&costs[b]).unwrap());

        let best_cost = costs[order[0]];
        cost_history.push(best_cost);

        // Check convergence
        let worst_cost = costs[order[n]];
        if worst_cost - best_cost < config.tolerance {
            let best = simplex[order[0]].clone();
            return OptimizerResult {
                values: best, final_cost: best_cost,
                iterations: iteration, cost_history,
            };
        }

        // Centroid of all points except worst
        let mut centroid = vec![0.0; n];
        for &idx in &order[..n] {
            for j in 0..n { centroid[j] += simplex[idx][j]; }
        }
        for j in 0..n { centroid[j] /= n as f64; }

        let worst_idx = order[n];

        // Reflection
        let reflected: Vec<f64> = (0..n).map(|j| centroid[j] + alpha * (centroid[j] - simplex[worst_idx][j])).collect();
        let mut p = project.clone();
        apply_values(&mut p, &config.params, &reflected);
        let reflected_cost = cost(&p, config.target_db, config.freq_min_hz, config.freq_max_hz);

        if reflected_cost < costs[order[n - 1]] && reflected_cost >= costs[order[0]] {
            simplex[worst_idx] = reflected;
            costs[worst_idx] = reflected_cost;
            continue;
        }

        if reflected_cost < costs[order[0]] {
            // Expansion
            let expanded: Vec<f64> = (0..n).map(|j| centroid[j] + gamma * (reflected[j] - centroid[j])).collect();
            let mut p2 = project.clone();
            apply_values(&mut p2, &config.params, &expanded);
            let expanded_cost = cost(&p2, config.target_db, config.freq_min_hz, config.freq_max_hz);

            if expanded_cost < reflected_cost {
                simplex[worst_idx] = expanded;
                costs[worst_idx] = expanded_cost;
            } else {
                simplex[worst_idx] = reflected;
                costs[worst_idx] = reflected_cost;
            }
            continue;
        }

        // Contraction
        let contracted: Vec<f64> = (0..n).map(|j| centroid[j] + rho * (simplex[worst_idx][j] - centroid[j])).collect();
        let mut p3 = project.clone();
        apply_values(&mut p3, &config.params, &contracted);
        let contracted_cost = cost(&p3, config.target_db, config.freq_min_hz, config.freq_max_hz);

        if contracted_cost < costs[worst_idx] {
            simplex[worst_idx] = contracted;
            costs[worst_idx] = contracted_cost;
            continue;
        }

        // Shrink: all points move toward the best
        let best_idx = order[0];
        for &idx in &order[1..] {
            for j in 0..n {
                simplex[idx][j] = simplex[best_idx][j] + sigma * (simplex[idx][j] - simplex[best_idx][j]);
            }
            let mut ps = project.clone();
            apply_values(&mut ps, &config.params, &simplex[idx]);
            costs[idx] = cost(&ps, config.target_db, config.freq_min_hz, config.freq_max_hz);
        }
    }

    // Return best vertex
    let best_idx = costs.iter().enumerate().min_by(|a, b| a.1.partial_cmp(b.1).unwrap()).unwrap().0;
    let best = simplex[best_idx].clone();
    OptimizerResult {
        values: best,
        final_cost: costs[best_idx],
        iterations: config.max_iterations,
        cost_history,
    }
}
