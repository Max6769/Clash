using System.Collections.Generic;
using UnityEngine;

// Minimal GameManager demonstrating deterministic tick simulation and card spawning
public class GameManager : MonoBehaviour
{
    public int TickRate = 30;
    private float accumulator = 0f;
    private float tickInterval;
    public long Seed = 12345;
    private System.Random rng;

    public struct Entity { public int id; public string cardId; public Vector2 pos; public int hp; public string owner; }
    public List<Entity> Entities = new List<Entity>();
    public int NextId = 1;

    void Start()
    {
        tickInterval = 1f / TickRate;
        rng = new System.Random((int)Seed);
    }

    void Update()
    {
        accumulator += Time.deltaTime;
        while(accumulator >= tickInterval)
        {
            Tick();
            accumulator -= tickInterval;
        }
    }

    void Tick()
    {
        // Example tick: move entities slightly and log
        for(int i=0;i<Entities.Count;i++)
        {
            var e = Entities[i];
            e.pos.x += (e.owner == "player" ? 0.1f : -0.1f);
            Entities[i] = e;
        }
    }

    public void Spawn(string cardId, string owner, Vector2 pos)
    {
        var e = new Entity(){ id = NextId++, cardId = cardId, owner = owner, pos = pos, hp = 100 };
        Entities.Add(e);
    }
}
