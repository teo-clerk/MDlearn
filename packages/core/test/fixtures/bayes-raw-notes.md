bayes thm — lec 7 (stats 201)

PROF SAID THIS IS ON THE MIDTERM!!! 

P(A|B) = P(B|A)P(A)/P(B)   <- memorize
- prior = what u believe before, posterior = after seeing evidence
- \(P(B)\) = total prob = P(B|A)P(A) + P(B|not A)P(not A)
- fun fact: Thomas Bayes was a presbyterian minister, published after he died (1763) by Richard Price lol

example from class: disease test
 - 1% of ppl have it
 - test catches 99% of sick ppl (sensitivity)
 - 5% false positive
 - u test positive, chance u actually sick??
 - everyone said 99% but its like 17%?? (0.99*0.01)/(0.99*0.01+0.05*0.99) = 0.0099/0.0594 = .1667
 - this is "base rate fallacy" / base rate neglect
 - also confusing P(A|B) w/ P(B|A) = prosecutors fallacy (?)
 - odds 1:99 before the test

> [!tip] trick
> imagine 10000 people instead of percentages

TODO: redo hw3 q4, costs $5 to print the solutions at the copy shop

python thing he showed:
def posterior(prior, sens, fpr):
    return sens*prior/(sens*prior + fpr*(1-prior))

- odds form?? posterior odds = prior odds * LR (LR = sens/fpr) -- didnt get this, check ch 2.3
- 2nd positive test -> use posterior as new prior!! (sequential updating)
