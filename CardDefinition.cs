using UnityEngine;

[System.Serializable]
public class CardDefinition
{
    public string id;
    public string name;
    public string type; // troop, building, spell
    public int cost;
    public int hp;
    public int dmg;
    public float attackSpeed;
    public float range;
    public float moveSpeed;
    public string rarity;
}
