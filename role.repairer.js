/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('role.builder');
 * mod.thing == 'a thing'; // true
 */

// @todo Try to have different targets.
// @todo Use energy from storage.
// @todo Walls and ramparts should be repaired to the same amount, not percentage.

var creepGeneral = require('creep.general');
var roleTransporter = require('role.transporter');
var utilities = require('utilities');

var wallHealth = {
    0: 1,
    1: 5000,
    2: 30000,
    3: 100000,
    4: 300000,
    5: 1000000,
    6: 2000000,
    7: 5000000,
    8: 300000000,
};

var roleRepairer = {

    getAvailableRepairTargets: function (creep) {
        var options = [];

        var targets = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.hits < structure.hitsMax
        });

        for (var i in targets) {
            var target = targets[i];

            var option = {
                priority: 4,
                weight: 1 - target.hits / target.hitsMax, // @todo Also factor in distance.
                type: 'structure',
                object: target,
            };

            var maxHealth = target.hitsMax;
            if (target.structureType == STRUCTURE_WALL || target.structureType == STRUCTURE_RAMPART) {
                option.priority--;

                // Walls and ramparts get repaired up to a certain health level.
                maxHealth = wallHealth[target.room.controller.level];
                if (target.hits >= maxHealth) {
                    // Skip this.
                    continue;
                }
                option.weight = 1 - target.hits / maxHealth;
                option.maxHealth = maxHealth;
            }

            if (target.hits / maxHealth > 0.9) {
                option.priority--;
            }
            if (target.hits / maxHealth < 0.2) {
                option.priority++;
            }

            // Roads are not that important, repair only when low.
            if (target.structureType == STRUCTURE_ROAD) {
                option.priority--;
            }

            // For many decaying structures, we don't care if they're "almost" full.
            if (target.structureType == STRUCTURE_ROAD || target.structureType == STRUCTURE_RAMPART || target.structureType == STRUCTURE_CONTAINER) {
                if (target.hits / maxHealth > 0.9) {
                    continue;
                }
            }

            // Slightly adjust weight so that closer structures get prioritized.
            option.weight -= creep.pos.getRangeTo(target) / 100;

            option.priority -= creepGeneral.getCreepsWithOrder('repair', target.id).length;

            options.push(option);
        }

        return options;
    },

    /**
     * Sets a good energy source target for this creep.
     */
    calculateRepairTarget: function (creep) {
        var best = utilities.getBestOption(roleRepairer.getAvailableRepairTargets(creep));

        if (best) {
            //console.log('best repair target for this', creep.memory.role , ':', best.object.structureType, best.object.id, '@ priority', best.priority, best.weight, 'HP:', best.object.hits, '/', best.object.hitsMax);
            creep.memory.repairTarget = best.object.id;

            creep.memory.order = {
                type: 'repair',
                target: best.object.id,
                maxHealth: best.maxHealth,
            };
        }
        else {
            delete creep.memory.repairTarget;
            delete creep.memory.order;
        }
    },

    repair: function (creep) {
        if (!creep.memory.repairTarget) {
            roleRepairer.calculateRepairTarget(creep);
        }
        var best = creep.memory.repairTarget;
        if (!best) {
            return false;
        }
        var target = Game.getObjectById(best);
        var maxHealth = target.hitsMax;
        if (creep.memory.order.maxHealth) {
            maxHealth = creep.memory.order.maxHealth;

            // Repair ramparts past their maxHealth to counteract decaying.
            if (target.structureType == STRUCTURE_RAMPART) {
                maxHealth = Math.min(maxHealth + 10000, target.hitsMax);
            }
        }
        if (!target || !target.hits || target.hits >= maxHealth) {
            roleRepairer.calculateRepairTarget(creep);
        }

        if (creep.repair(target) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target);

            // Also try to repair things that are close by when appropriate.
            let workParts = creep.memory.body.work;
            if (workParts && (creep.carry.energy > creep.carryCapacity * 0.7 || creep.carry.energy < creep.carryCapacity * 0.3)) {
                var needsRepair = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: (structure) => {
                        let maxHealth = structure.hitsMax;
                        if (structure.structureType == STRUCTURE_RAMPART || structure.structureType == STRUCTURE_WALL) {
                            maxHealth = wallHealth[structure.room.controller.level];
                        }
                        if (structure.hits < maxHealth) {
                            return true;
                        }
                    }
                });
                if (needsRepair && creep.pos.getRangeTo(needsRepair) <= 3) {
                    creep.repair(needsRepair);
                }
            }
        }
        return true;
    },

    setRepairing: function (creep, repairing) {
        creep.memory.repairing = repairing;
        delete creep.memory.repairTarget;
        delete creep.memory.tempRole;
    },

    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.memory.repairing && creep.carry.energy == 0) {
            roleRepairer.setRepairing(creep, false);
        }
        else if (!creep.memory.repairing && creep.carry.energy == creep.carryCapacity) {
            roleRepairer.setRepairing(creep, true);
        }

        if (creep.memory.repairing) {
            return roleRepairer.repair(creep);
        }
        else {
            return roleTransporter.getEnergy(creep);
        }
    },

};

module.exports = roleRepairer;
