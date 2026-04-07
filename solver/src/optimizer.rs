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

/// Target curve for the optimizer cost function.
#[derive(Debug, Clone)]
pub enum TargetCurve {
    Flat(f64),
    Slope { db_at_1khz: f64, slope_db_per_octave: f64 },
    Custom(Vec<(f64, f64)>), // (freq_hz, db) pairs, linearly interpolated on log-freq
}

impl TargetCurve {
    pub fn target_at(&self, freq_hz: f64) -> f64 {
        match self {
            TargetCurve::Flat(db) => *db,
            TargetCurve::Slope { db_at_1khz, slope_db_per_octave } => {
                let octaves_from_1k = (freq_hz / 1000.0).log2();
                db_at_1khz + slope_db_per_octave * octaves_from_1k
            }
            TargetCurve::Custom(pts) => {
                if pts.is_empty() { return 86.0; }
                if freq_hz <= pts[0].0 { return pts[0].1; }
                if freq_hz >= pts.last().unwrap().0 { return pts.last().unwrap().1; }
                // Linear interpolation on log-frequency scale
                for w in pts.windows(2) {
                    if freq_hz >= w[0].0 && freq_hz <= w[1].0 {
                        let t = (freq_hz.ln() - w[0].0.ln()) / (w[1].0.ln() - w[0].0.ln());
                        return w[0].1 + t * (w[1].1 - w[0].1);
                    }
                }
                pts.last().unwrap().1
            }
        }
    }
}

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

/// Frequency weighting for cost function.
#[derive(Debug, Clone)]
pub enum FrequencyWeight {
    /// Equal weight across all frequencies
    Uniform,
    /// 2× weight in the 1-5 kHz presence region
    PresenceBoosted,
}

/// Optimizer configuration.
#[derive(Debug, Clone)]
pub struct OptimizerConfig {
    /// Parameters to optimize
    pub params: Vec<OptParam>,
    /// Target SPL curve
    pub target: TargetCurve,
    /// Frequency weighting
    pub freq_weight: FrequencyWeight,
    /// Frequency range for cost function (Hz)
    pub freq_min_hz: f64,
    pub freq_max_hz: f64,
    /// Maximum iterations
    pub max_iterations: usize,
    /// Convergence threshold (stop if cost improvement < this)
    pub tolerance: f64,
    /// Minimum impedance constraint (Ω). None = no constraint.
    pub min_impedance_ohm: Option<f64>,
    /// Penalty weight for impedance violations (default 10.0)
    pub impedance_penalty_weight: f64,
    /// Penalty weight for displacement/Xmax violations (default 5.0)
    pub displacement_penalty_weight: f64,
    /// Algorithm choice
    pub algorithm: Algorithm,
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

/// Cost function: weighted mean squared error between system SPL and target curve.
fn cost(project: &SpeakerProject, config: &OptimizerConfig) -> f64 {
    let result = match solve_system(project) {
        Ok(r) => r,
        Err(_) => return 1e12,
    };

    let mut sum = 0.0;
    let mut total_weight = 0.0;
    for (i, &freq) in result.frequencies_hz.iter().enumerate() {
        if freq >= config.freq_min_hz && freq <= config.freq_max_hz {
            let target = config.target.target_at(freq);
            let err = result.system_spl_db[i] - target;
            let weight = match config.freq_weight {
                FrequencyWeight::Uniform => 1.0,
                FrequencyWeight::PresenceBoosted => {
                    if freq >= 1000.0 && freq <= 5000.0 { 2.0 } else { 1.0 }
                }
            };
            sum += weight * err * err;
            total_weight += weight;
        }
    }
    if total_weight == 0.0 { return 1e12; }
    let mut spl_cost = sum / total_weight;

    // Impedance floor penalty
    if let Some(z_min) = config.min_impedance_ohm {
        let min_z = result.system_impedance_ohm.iter()
            .zip(result.frequencies_hz.iter())
            .filter(|(_, &f)| f >= 20.0 && f <= 20000.0)
            .map(|(&z, _)| z)
            .fold(f64::MAX, f64::min);
        if min_z < z_min {
            let violation = z_min - min_z;
            spl_cost += config.impedance_penalty_weight * violation * violation;
        }
    }

    // Displacement penalty: penalize any way exceeding its Xmax
    if config.displacement_penalty_weight > 0.0 {
        for (i, &max_disp) in result.way_max_displacement_mm.iter().enumerate() {
            if i >= project.ways.len() { break; }
            let xmax_mm = project.ways[i].driver.xmax_m * 1000.0;
            if xmax_mm > 0.0 && max_disp > xmax_mm {
                let overshoot = max_disp - xmax_mm;
                spl_cost += config.displacement_penalty_weight * overshoot * overshoot;
            }
        }
    }

    spl_cost
}

/// Optimizer algorithm choice.
#[derive(Debug, Clone, PartialEq)]
pub enum Algorithm {
    NelderMead,
    DifferentialEvolution,
    /// DE global search + NM local polish
    Hybrid,
}

/// Run optimization on a speaker project.
pub fn optimize(
    project: &SpeakerProject,
    config: &OptimizerConfig,
) -> OptimizerResult {
    let n = config.params.len();
    if n == 0 {
        return OptimizerResult { values: vec![], final_cost: 0.0, iterations: 0, cost_history: vec![] };
    }

    let initial = extract_values(project, &config.params);

    match config.algorithm {
        Algorithm::NelderMead => {
            nelder_mead(project, config, &initial)
        }
        Algorithm::DifferentialEvolution => {
            let (values, final_cost, history) = differential_evolution(project, config, &initial);
            OptimizerResult { values, final_cost, iterations: history.len(), cost_history: history }
        }
        Algorithm::Hybrid => {
            // Phase 1: DE global search (2/3 of iterations)
            let de_iters = (config.max_iterations * 2) / 3;
            let mut de_config = config.clone();
            de_config.max_iterations = de_iters;
            let (de_values, _, mut history) = differential_evolution(project, &de_config, &initial);

            // Phase 2: NM polish from DE's best (1/3 of iterations)
            let mut polished_project = project.clone();
            apply_values(&mut polished_project, &config.params, &de_values);
            let mut nm_config = config.clone();
            nm_config.max_iterations = config.max_iterations - de_iters;
            nm_config.algorithm = Algorithm::NelderMead;
            let nm_result = nelder_mead(&polished_project, &nm_config, &de_values);
            history.extend(nm_result.cost_history);

            OptimizerResult {
                values: nm_result.values,
                final_cost: nm_result.final_cost,
                iterations: history.len(),
                cost_history: history,
            }
        }
    }
}

/// Nelder-Mead simplex optimizer.
/// Reference: Nelder & Mead, "A Simplex Method for Function Minimization" (1965)
fn nelder_mead(
    project: &SpeakerProject,
    config: &OptimizerConfig,
    initial: &[f64],
) -> OptimizerResult {
    let n = initial.len();

    // Initialize simplex: n+1 vertices
    let mut simplex: Vec<Vec<f64>> = Vec::with_capacity(n + 1);
    simplex.push(initial.to_vec());
    for i in 0..n {
        let mut v = initial.to_vec();
        let step = if v[i].abs() > 1.0 { v[i] * 0.1 } else { 1.0 };
        v[i] += step;
        simplex.push(v);
    }

    // Evaluate cost at each vertex
    let mut costs: Vec<f64> = simplex.iter().map(|v| {
        let mut p = project.clone();
        apply_values(&mut p, &config.params, v);
        cost(&p, config)
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
        let reflected_cost = cost(&p, config);

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
            let expanded_cost = cost(&p2, config);

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
        let contracted_cost = cost(&p3, config);

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
            costs[idx] = cost(&ps, config);
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

/// Xorshift64 PRNG — simple, no external deps, deterministic.
fn xorshift(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    *state
}

/// Pick 3 distinct random indices, all != exclude.
fn select_three_distinct(pop_size: usize, exclude: usize, rng: &mut u64) -> (usize, usize, usize) {
    let pick = |rng: &mut u64, excl: &[usize]| -> usize {
        loop {
            let idx = (xorshift(rng) as usize) % pop_size;
            if !excl.contains(&idx) { return idx; }
        }
    };
    let a = pick(rng, &[exclude]);
    let b = pick(rng, &[exclude, a]);
    let c = pick(rng, &[exclude, a, b]);
    (a, b, c)
}

/// Differential Evolution global optimizer.
/// Reference: Storn & Price (1997) "Differential Evolution — A Simple and
/// Efficient Heuristic for Global Optimization over Continuous Spaces"
fn differential_evolution(
    project: &SpeakerProject,
    config: &OptimizerConfig,
    initial_values: &[f64],
) -> (Vec<f64>, f64, Vec<f64>) {
    let n = initial_values.len();
    let pop_size = (n * 10).max(20).min(100); // 10× params, clamped 20-100
    let f_weight = 0.8;  // DE/rand/1 mutation weight
    let cr = 0.9;        // crossover probability
    let max_gen = config.max_iterations;

    // Initialize population: random perturbations around initial values
    let mut population: Vec<Vec<f64>> = Vec::with_capacity(pop_size);
    population.push(initial_values.to_vec()); // include initial guess
    let mut rng_state: u64 = 42;
    for _ in 1..pop_size {
        let mut individual = initial_values.to_vec();
        for j in 0..n {
            xorshift(&mut rng_state);
            let r = (rng_state as f64) / (u64::MAX as f64);
            let perturbation = (r - 0.5) * 2.0 * initial_values[j].abs().max(1.0) * 0.5;
            individual[j] = initial_values[j] + perturbation;
        }
        population.push(individual);
    }

    // Evaluate initial population
    let mut costs: Vec<f64> = population.iter().map(|ind| {
        let mut proj = project.clone();
        apply_values(&mut proj, &config.params, ind);
        cost(&proj, config)
    }).collect();

    let mut cost_history = Vec::new();
    let best_idx = costs.iter().enumerate().min_by(|a, b| a.1.partial_cmp(b.1).unwrap()).unwrap().0;
    cost_history.push(costs[best_idx]);

    // DE/rand/1/bin main loop
    for _gen in 0..max_gen {
        for i in 0..pop_size {
            // Select 3 distinct random indices != i
            let (a, b, c) = select_three_distinct(pop_size, i, &mut rng_state);

            // Mutation + crossover
            let j_rand = (xorshift(&mut rng_state) as usize) % n;
            let mut trial = population[i].clone();
            for j in 0..n {
                let r = (xorshift(&mut rng_state) as f64) / (u64::MAX as f64);
                if r < cr || j == j_rand {
                    trial[j] = population[a][j] + f_weight * (population[b][j] - population[c][j]);
                }
            }

            // Evaluate trial
            let mut proj = project.clone();
            apply_values(&mut proj, &config.params, &trial);
            let trial_cost = cost(&proj, config);

            // Selection: keep better
            if trial_cost < costs[i] {
                population[i] = trial;
                costs[i] = trial_cost;
            }
        }

        let best_idx = costs.iter().enumerate().min_by(|a, b| a.1.partial_cmp(b.1).unwrap()).unwrap().0;
        cost_history.push(costs[best_idx]);
    }

    let best_idx = costs.iter().enumerate().min_by(|a, b| a.1.partial_cmp(b.1).unwrap()).unwrap().0;
    (population[best_idx].clone(), costs[best_idx], cost_history)
}

/// Snap all passive component values to nearest E-series standard values.
/// Applied after optimization as a post-processing step.
pub fn snap_passive_to_e_series(project: &mut SpeakerProject, series: &str) {
    use crate::crossover::e_series;
    use crate::crossover::PassiveBlock;

    let round_fn: fn(f64) -> f64 = match series {
        "E12" => e_series::round_e12,
        "E24" => e_series::round_e24,
        _ => return,
    };

    for way in &mut project.ways {
        for block in &mut way.passive_filters {
            match block {
                PassiveBlock::SeriesR { ohms } => *ohms = round_fn(*ohms),
                PassiveBlock::SeriesL { henries, .. } => *henries = round_fn(*henries),
                PassiveBlock::SeriesC { farads } => *farads = round_fn(*farads),
                PassiveBlock::ShuntR { ohms } => *ohms = round_fn(*ohms),
                PassiveBlock::ShuntL { henries, .. } => *henries = round_fn(*henries),
                PassiveBlock::ShuntC { farads } => *farads = round_fn(*farads),
                PassiveBlock::ZobelShunt { ohms, farads } => {
                    *ohms = round_fn(*ohms);
                    *farads = round_fn(*farads);
                }
                PassiveBlock::LPad { series_ohms, shunt_ohms } => {
                    *series_ohms = round_fn(*series_ohms);
                    *shunt_ohms = round_fn(*shunt_ohms);
                }
                PassiveBlock::NotchShunt { ohms, henries, farads } |
                PassiveBlock::NotchSeries { ohms, henries, farads } => {
                    *ohms = round_fn(*ohms);
                    *henries = round_fn(*henries);
                    *farads = round_fn(*farads);
                }
            }
        }
    }
}
